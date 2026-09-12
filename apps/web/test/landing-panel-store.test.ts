import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDb, user, type Database } from "@podway/db";
import {
  getPanelData,
  recordLandingEvent,
  setPinnedDefault,
  setRunningStatus,
} from "../lib/landing-experiment-store";
import { LANDING_EXPERIMENT } from "../lib/landing-experiment-config";

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
  vi.restoreAllMocks();
});

async function freshDb(): Promise<Database> {
  const test = await createTestDb();
  close = test.close;
  const db = test.db;
  await db.insert(user).values({ id: "admin", name: "Admin", email: "admin@example.com" });
  return db;
}

describe("landing panel store", () => {
  it("setPinnedDefault pins without changing the run status", async () => {
    const db = await freshDb();
    const runtime = await setPinnedDefault("admin", "outcomes", LANDING_EXPERIMENT.id, db);
    expect(runtime.pinnedVariant).toBe("outcomes");
    // The experiment is still running — setting a default must not stop it.
    expect(runtime.status).toBe("active");
    await expect(
      setPinnedDefault("admin", "not-a-variant", LANDING_EXPERIMENT.id, db),
    ).rejects.toThrow(/Unknown landing variant/);
  });

  it("setRunningStatus toggles status and stopping keeps the pinned default", async () => {
    const db = await freshDb();
    await setPinnedDefault("admin", "outcomes", LANDING_EXPERIMENT.id, db);

    const stopped = await setRunningStatus("admin", false, LANDING_EXPERIMENT.id, db);
    expect(stopped.status).toBe("stopped");
    expect(stopped.stoppedAt).not.toBeNull();
    // Stopping keeps the current default — the pin is untouched.
    expect(stopped.pinnedVariant).toBe("outcomes");

    const restarted = await setRunningStatus("admin", true, LANDING_EXPERIMENT.id, db);
    expect(restarted.status).toBe("active");
    expect(restarted.stoppedAt).toBeNull();
    expect(restarted.pinnedVariant).toBe("outcomes");
  });

  it("getPanelData reports per-variant visitors/conversions and resolves the served variant", async () => {
    const db = await freshDb();
    // A converting visitor on agent-computer, a non-converting visitor on outcomes.
    await recordLandingEvent(
      { visitorId: "visitor_ac_00000000001", variant: "agent-computer", type: "landing_exposure" },
      db,
    );
    await recordLandingEvent(
      { visitorId: "visitor_ac_00000000001", variant: "agent-computer", type: "signin_completed" },
      db,
    );
    await recordLandingEvent(
      { visitorId: "visitor_oc_00000000001", variant: "outcomes", type: "landing_exposure" },
      db,
    );

    // Default (no pin): served variant is the active fallback (agent-computer).
    let panel = (await getPanelData(LANDING_EXPERIMENT.id, db))!;
    expect(panel).not.toBeNull();
    expect(panel.servedVariant).toBe(LANDING_EXPERIMENT.fallbackVariant);
    const ac = panel.rows.find((r) => r.variant === "agent-computer")!;
    const oc = panel.rows.find((r) => r.variant === "outcomes")!;
    expect(ac.visitors).toBe(1);
    expect(ac.conversions).toBe(1);
    expect(oc.visitors).toBe(1);
    expect(oc.conversions).toBe(0);
    expect(panel.totalVisitors).toBe(2);

    // Pin outcomes as default, then stop: the served variant follows the pin.
    await setPinnedDefault("admin", "outcomes", LANDING_EXPERIMENT.id, db);
    await setRunningStatus("admin", false, LANDING_EXPERIMENT.id, db);
    panel = (await getPanelData(LANDING_EXPERIMENT.id, db))!;
    expect(panel.status).toBe("stopped");
    expect(panel.pinnedVariant).toBe("outcomes");
    expect(panel.servedVariant).toBe("outcomes");
    expect(panel.rows.find((r) => r.variant === "outcomes")!.isDefault).toBe(true);
    expect(panel.rows.find((r) => r.variant === "outcomes")!.isControl).toBe(true);
  });
});
