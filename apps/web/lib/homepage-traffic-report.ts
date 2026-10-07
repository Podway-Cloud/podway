import "server-only";

// Results + change log for /admin/experiments. Results are per PERIOD (each saved split starts one):
// a period's cohort is the visitors whose FIRST homepage exposure fell in it, and only THEIR sign-ups
// and pods count — so old and new splits never mix, and a returning visitor never moves cohorts.
import {
  and,
  asc,
  createAppDb,
  desc,
  eq,
  gte,
  inArray,
  landingExperimentAudit,
  landingExperimentEvents,
  landingExperimentRuns,
  user,
  type Database,
} from "@podway/db";
import {
  ACTIVE_LANDING_EXPERIMENT,
  LANDING_VARIANT_META,
  type LandingExperimentDefinition,
  type LandingVariant,
} from "./landing-experiment-config";
import { normalizeWeights, type TrafficWeights } from "./homepage-traffic";

export interface PeriodRow {
  variant: LandingVariant;
  visitors: number;
  signups: number;
  pods: number;
}

export interface PeriodResult {
  period: number;
  start: Date;
  end: Date | null;
  weights: TrafficWeights;
  rows: PeriodRow[];
}

export interface ChangeLogEntry {
  at: Date;
  who: string;
  what: string;
}

function landingName(v: string | null): string {
  return v && v in LANDING_VARIANT_META ? LANDING_VARIANT_META[v as LandingVariant].name : "—";
}

export function describeSplit(definition: LandingExperimentDefinition, weights: TrafficWeights): string {
  return definition.variants.map((v) => `${weights[v] ?? 0}% ${landingName(v)}`).join(" · ");
}

/** All periods of the active experiment, newest first. Period 1 starts at the run's start; each
 * later one at a saved split ('traffic' audit row whose next status is active). */
export async function getTrafficResults(
  db: Database = createAppDb(),
  definition: LandingExperimentDefinition = ACTIVE_LANDING_EXPERIMENT,
): Promise<PeriodResult[]> {
  const [[run], splits] = await Promise.all([
    db.select().from(landingExperimentRuns).where(eq(landingExperimentRuns.experimentId, definition.id)).limit(1),
    db
      .select({ at: landingExperimentAudit.at, weights: landingExperimentAudit.nextWeights })
      .from(landingExperimentAudit)
      .where(
        and(
          eq(landingExperimentAudit.experimentId, definition.id),
          eq(landingExperimentAudit.action, "traffic"),
          eq(landingExperimentAudit.nextStatus, "active"),
        ),
      )
      .orderBy(asc(landingExperimentAudit.at)),
  ]);
  if (!run) return [];
  const bounds: { start: Date; weights: TrafficWeights }[] = [
    { start: run.startedAt, weights: { ...definition.allocation } },
    ...splits.map((s) => ({ start: s.at, weights: normalizeWeights(definition, s.weights) ?? {} })),
  ];
  // ponytail: whole-experiment scan aggregated in JS — fine at today's traffic (tens of visitors a
  // day); move to a GROUP BY when the events table reaches ~100k rows.
  const events = await db
    .select({
      visitorId: landingExperimentEvents.visitorId,
      variant: landingExperimentEvents.variant,
      type: landingExperimentEvents.type,
      at: landingExperimentEvents.at,
    })
    .from(landingExperimentEvents)
    .where(
      and(
        eq(landingExperimentEvents.experimentId, definition.id),
        gte(landingExperimentEvents.at, run.startedAt),
        inArray(landingExperimentEvents.type, ["landing_exposure", definition.primaryMetric, "pod_created"]),
      ),
    );
  const exposure = new Map<string, { variant: LandingVariant; at: Date }>();
  for (const e of events) if (e.type === "landing_exposure") exposure.set(e.visitorId, { variant: e.variant, at: e.at });

  const results = bounds.map((b, i) => {
    const end = bounds[i + 1]?.start ?? null;
    const rows = new Map<LandingVariant, PeriodRow>(
      definition.variants.map((variant) => [variant, { variant, visitors: 0, signups: 0, pods: 0 }]),
    );
    const inPeriod = (at: Date) => at >= b.start && (!end || at < end);
    for (const x of exposure.values()) {
      const row = rows.get(x.variant);
      if (row && inPeriod(x.at)) row.visitors++;
    }
    for (const e of events) {
      const x = exposure.get(e.visitorId);
      if (!x || !inPeriod(x.at) || e.type === "landing_exposure") continue;
      const row = rows.get(x.variant);
      if (!row) continue;
      if (e.type === definition.primaryMetric) row.signups++;
      if (e.type === "pod_created") row.pods++;
    }
    return { period: i + 1, start: b.start, end, weights: b.weights, rows: [...rows.values()] };
  });
  return results.reverse();
}

/** Every control change, newest first, in plain words. Includes legacy stop/pin/unpin rows. */
export async function getTrafficChangeLog(
  db: Database = createAppDb(),
  definition: LandingExperimentDefinition = ACTIVE_LANDING_EXPERIMENT,
  limit = 30,
): Promise<ChangeLogEntry[]> {
  const rows = await db
    .select({
      at: landingExperimentAudit.at,
      action: landingExperimentAudit.action,
      nextStatus: landingExperimentAudit.nextStatus,
      nextPinned: landingExperimentAudit.nextPinnedVariant,
      nextWeights: landingExperimentAudit.nextWeights,
      name: user.name,
      email: user.email,
    })
    .from(landingExperimentAudit)
    .leftJoin(user, eq(user.id, landingExperimentAudit.actorUserId))
    .where(eq(landingExperimentAudit.experimentId, definition.id))
    .orderBy(desc(landingExperimentAudit.at))
    .limit(limit);
  return rows.map((r) => {
    const weights = normalizeWeights(definition, r.nextWeights);
    const what =
      r.nextStatus === "stopped"
        ? `Only ${landingName(r.nextPinned)} — split paused`
        : weights
          ? `Split ${describeSplit(definition, weights)} — new results period`
          : "Split resumed";
    return { at: r.at, who: r.name || r.email || "admin", what };
  });
}
