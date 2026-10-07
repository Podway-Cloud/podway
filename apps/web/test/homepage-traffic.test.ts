import { afterEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  eq,
  landingExperimentAudit,
  landingExperimentEvents,
  landingExperimentRuns,
  user,
  type Database,
} from "@podway/db";
import { ACTIVE_LANDING_EXPERIMENT, chooseLandingVariant } from "../lib/landing-experiment-config";
import { applyHomepageTraffic, getHomepageTraffic, normalizeWeights } from "../lib/homepage-traffic";
import { getTrafficChangeLog, getTrafficResults } from "../lib/homepage-traffic-report";

const EXP = ACTIVE_LANDING_EXPERIMENT;
let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

async function freshDb(): Promise<Database> {
  const t = await createTestDb();
  close = t.close;
  await t.db.insert(user).values({ id: "admin", name: "Vels", email: "admin@example.com" });
  return t.db;
}

const audits = (db: Database) =>
  db.select().from(landingExperimentAudit).where(eq(landingExperimentAudit.experimentId, EXP.id));

describe("homepage traffic control", () => {
  it("starts on the coded 50/50 split in period 1", async () => {
    const db = await freshDb();
    const t = await getHomepageTraffic(db);
    expect(t).toMatchObject({ mode: "split", one: null, period: 1, weights: { "agent-computer": 50, selfhost: 50 } });
  });

  it("saves a split atomically with an audit row and a new results period; an unchanged save is a no-op", async () => {
    const db = await freshDb();
    const t = await applyHomepageTraffic("admin", { mode: "split", weights: { "agent-computer": 30, selfhost: 70 } }, db);
    expect(t).toMatchObject({ mode: "split", period: 2, weights: { "agent-computer": 30, selfhost: 70 } });
    const [row] = await audits(db);
    expect(row).toMatchObject({ action: "traffic", actorUserId: "admin", nextStatus: "active", nextWeights: { "agent-computer": 30, selfhost: 70 } });

    await applyHomepageTraffic("admin", { mode: "split", weights: { "agent-computer": 30, selfhost: 70 } }, db);
    expect(await audits(db)).toHaveLength(1);
    expect((await getHomepageTraffic(db)).period).toBe(2);
  });

  it("one landing pauses the split (keeps its weights and period); switching back starts a new period", async () => {
    const db = await freshDb();
    await applyHomepageTraffic("admin", { mode: "split", weights: { "agent-computer": 30, selfhost: 70 } }, db);
    const one = await applyHomepageTraffic("admin", { mode: "one", variant: "selfhost" }, db);
    expect(one).toMatchObject({ mode: "one", one: "selfhost", period: 2, weights: { "agent-computer": 30, selfhost: 70 } });
    const [run] = await db.select().from(landingExperimentRuns).where(eq(landingExperimentRuns.experimentId, EXP.id));
    expect(run).toMatchObject({ status: "stopped", pinnedVariant: "selfhost" }); // what page.tsx serves

    const back = await applyHomepageTraffic("admin", { mode: "split", weights: { "agent-computer": 30, selfhost: 70 } }, db);
    expect(back).toMatchObject({ mode: "split", one: null, period: 3 });
    expect(await audits(db)).toHaveLength(3);
  });

  it("refuses a split that is not this test's landings or does not add up to 100", async () => {
    const db = await freshDb();
    await expect(
      applyHomepageTraffic("admin", { mode: "split", weights: { "agent-computer": 30, selfhost: 60 } }, db),
    ).rejects.toThrow(/100%/);
    await expect(
      applyHomepageTraffic("admin", { mode: "split", weights: { outcomes: 50, selfhost: 50 } }, db),
    ).rejects.toThrow(/100%/);
    await expect(applyHomepageTraffic("admin", { mode: "one", variant: "outcomes" }, db)).rejects.toThrow(/Unknown/);
    expect(await audits(db)).toHaveLength(0);
    expect(normalizeWeights(EXP, { "agent-computer": 50.5, selfhost: 49.5 })).toBeNull();
  });

  it("counts each visitor in the period of their FIRST exposure only", async () => {
    const db = await freshDb();
    await getHomepageTraffic(db); // creates the run; move period 1's start 2h back so its visit is clearly before the split
    const t0 = Date.now();
    await db.update(landingExperimentRuns).set({ startedAt: new Date(t0 - 7_200_000) }).where(eq(landingExperimentRuns.experimentId, EXP.id));
    const ev = (id: string, visitorId: string, variant: "agent-computer" | "selfhost", type: string, ms: number) =>
      db.insert(landingExperimentEvents).values({
        id, experimentId: EXP.id, visitorId, variant, type: type as "landing_exposure", at: new Date(t0 + ms),
      });
    await ev("e1", "visitor_a_1234567890abcd", "agent-computer", "landing_exposure", -3_600_000);
    await applyHomepageTraffic("admin", { mode: "split", weights: { "agent-computer": 10, selfhost: 90 } }, db);
    // Visitor A came in period 1 and signs in during period 2 → still period 1.
    await ev("e2", "visitor_a_1234567890abcd", "agent-computer", EXP.primaryMetric, 3_600_000);
    await ev("e3", "visitor_b_1234567890abcd", "selfhost", "landing_exposure", 3_600_000);
    await ev("e4", "visitor_b_1234567890abcd", "selfhost", EXP.primaryMetric, 3_700_000);
    await ev("e5", "visitor_b_1234567890abcd", "selfhost", "pod_created", 3_800_000);

    const [p2, p1] = await getTrafficResults(db);
    expect(p2!.period).toBe(2);
    expect(p2!.rows).toEqual([
      { variant: "agent-computer", visitors: 0, signups: 0, pods: 0 },
      { variant: "selfhost", visitors: 1, signups: 1, pods: 1 },
    ]);
    expect(p1!.rows).toEqual([
      { variant: "agent-computer", visitors: 1, signups: 1, pods: 0 },
      { variant: "selfhost", visitors: 0, signups: 0, pods: 0 },
    ]);
  });

  it("writes a plain-words change log, newest first", async () => {
    const db = await freshDb();
    await applyHomepageTraffic("admin", { mode: "split", weights: { "agent-computer": 30, selfhost: 70 } }, db);
    await applyHomepageTraffic("admin", { mode: "one", variant: "selfhost" }, db);
    const log = await getTrafficChangeLog(db);
    expect(log.map((e) => [e.who, e.what])).toEqual([
      ["Vels", "Only Self-host — split paused"],
      ["Vels", "Split 30% Agent computer · 70% Self-host — new results period"],
    ]);
  });

  it("assigns new visitors by the live split", () => {
    const live = { "agent-computer": 10, selfhost: 90 };
    expect(chooseLandingVariant(0.05, EXP, live)).toBe("agent-computer");
    expect(chooseLandingVariant(0.15, EXP, live)).toBe("selfhost");
    expect(chooseLandingVariant(0.15, EXP)).toBe("agent-computer"); // coded 50/50 when no live split
  });
});
