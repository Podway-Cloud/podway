// Homepage traffic: who sees podway.io/ — a runtime split between landings, or one landing for everyone.
// The ONE control behind /admin/experiments (replaces Set default / Turn on-off / Stop / Pin / Promote).
// No "server-only" import: the Node-runtime middleware reads it too (getHomepageTrafficCached).
//
// Model, on the active experiment's landing_experiment_runs row:
//   split → status 'active', pinned_variant NULL, weights {variant: percent} (NULL = coded allocation)
//   one   → status 'stopped', pinned_variant = the landing everyone sees (weights kept for switching back)
// Every saved split bumps `period`, so results from different splits never mix. Each change writes one
// 'traffic' audit row in the SAME statement (Neon's HTTP driver has no transactions).
import { randomUUID } from "node:crypto";
import { createAppDb, eq, landingExperimentRuns, sql, type Database } from "@podway/db";
import {
  ACTIVE_LANDING_EXPERIMENT,
  isVariantForExperiment,
  type LandingExperimentDefinition,
  type LandingVariant,
} from "./landing-experiment-config";

export type TrafficWeights = Partial<Record<LandingVariant, number>>;

export interface HomepageTraffic {
  mode: "split" | "one";
  /** The split (also kept while in "one" mode, so switching back restores it). */
  weights: TrafficWeights;
  /** The landing everyone sees in "one" mode; null in split mode. */
  one: LandingVariant | null;
  period: number;
  periodStartedAt: Date;
}

export type TrafficChange =
  | { mode: "split"; weights: TrafficWeights }
  | { mode: "one"; variant: LandingVariant };

/** A valid split: only this experiment's variants, whole percents 0–100, summing to 100. */
export function normalizeWeights(
  definition: LandingExperimentDefinition,
  raw: unknown,
): TrafficWeights | null {
  if (!raw || typeof raw !== "object") return null;
  const out: TrafficWeights = {};
  let sum = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isVariantForExperiment(definition, key)) return null;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) return null;
    out[key] = value;
    sum += value;
  }
  return sum === 100 ? out : null;
}

function readTraffic(
  run: typeof landingExperimentRuns.$inferSelect,
  definition: LandingExperimentDefinition,
): HomepageTraffic {
  const weights = normalizeWeights(definition, run.weights) ?? { ...definition.allocation };
  const one = isVariantForExperiment(definition, run.pinnedVariant) ? run.pinnedVariant : null;
  const stopped = run.status === "stopped";
  return {
    mode: stopped ? "one" : "split",
    weights,
    one: stopped ? (one ?? definition.fallbackVariant) : null,
    period: run.period,
    periodStartedAt: run.periodStartedAt ?? run.startedAt,
  };
}

async function loadRun(db: Database, definition: LandingExperimentDefinition) {
  await db.insert(landingExperimentRuns).values({ experimentId: definition.id }).onConflictDoNothing();
  const [run] = await db
    .select()
    .from(landingExperimentRuns)
    .where(eq(landingExperimentRuns.experimentId, definition.id))
    .limit(1);
  if (!run) throw new Error("Landing experiment runtime could not be initialized");
  return run;
}

export async function getHomepageTraffic(
  db: Database = createAppDb(),
  definition: LandingExperimentDefinition = ACTIVE_LANDING_EXPERIMENT,
): Promise<HomepageTraffic> {
  return readTraffic(await loadRun(db, definition), definition);
}

/** Apply one change atomically (row update + 'traffic' audit row, one statement). No-op if unchanged. */
export async function applyHomepageTraffic(
  actorUserId: string,
  change: TrafficChange,
  db: Database = createAppDb(),
  definition: LandingExperimentDefinition = ACTIVE_LANDING_EXPERIMENT,
): Promise<HomepageTraffic> {
  await loadRun(db, definition);
  const now = new Date();
  const auditId = randomUUID();
  const id = definition.id;
  if (change.mode === "split") {
    const weights = normalizeWeights(definition, change.weights);
    if (!weights) throw new Error("A split must use this test's landings and add up to 100%");
    const json = JSON.stringify(weights);
    await db.execute(sql`
      WITH current AS MATERIALIZED (
        SELECT status, pinned_variant, weights FROM landing_experiment_runs
        WHERE experiment_id = ${id} FOR UPDATE
      ), updated AS (
        UPDATE landing_experiment_runs AS run
        SET status = 'active', pinned_variant = NULL, stopped_at = NULL,
            weights = ${json}::jsonb, period = run.period + 1, period_started_at = ${now},
            updated_by = ${actorUserId}, updated_at = ${now}
        FROM current
        WHERE run.experiment_id = ${id}
          AND NOT (current.status = 'active' AND current.pinned_variant IS NULL
                   AND current.weights IS NOT DISTINCT FROM ${json}::jsonb)
        RETURNING current.status AS ps, current.pinned_variant AS pp, current.weights AS pw
      ), audited AS (
        INSERT INTO landing_experiment_audit (id, experiment_id, actor_user_id, action,
          previous_status, previous_pinned_variant, previous_weights,
          next_status, next_pinned_variant, next_weights, at)
        SELECT ${auditId}, ${id}, ${actorUserId}, 'traffic', ps, pp, pw, 'active', NULL, ${json}::jsonb, ${now}
        FROM updated RETURNING id
      )
      SELECT id FROM audited
    `);
  } else {
    if (!isVariantForExperiment(definition, change.variant)) throw new Error("Unknown landing");
    const v = change.variant;
    await db.execute(sql`
      WITH current AS MATERIALIZED (
        SELECT status, pinned_variant, weights FROM landing_experiment_runs
        WHERE experiment_id = ${id} FOR UPDATE
      ), updated AS (
        UPDATE landing_experiment_runs AS run
        SET status = 'stopped', pinned_variant = ${v}, stopped_at = COALESCE(run.stopped_at, ${now}),
            updated_by = ${actorUserId}, updated_at = ${now}
        FROM current
        WHERE run.experiment_id = ${id}
          AND NOT (current.status = 'stopped' AND current.pinned_variant IS NOT DISTINCT FROM ${v})
        RETURNING current.status AS ps, current.pinned_variant AS pp, current.weights AS pw
      ), audited AS (
        INSERT INTO landing_experiment_audit (id, experiment_id, actor_user_id, action,
          previous_status, previous_pinned_variant, previous_weights,
          next_status, next_pinned_variant, next_weights, at)
        SELECT ${auditId}, ${id}, ${actorUserId}, 'traffic', ps, pp, pw, 'stopped', ${v}, pw, ${now}
        FROM updated RETURNING id
      )
      SELECT id FROM audited
    `);
  }
  trafficCache = null; // this process serves the change at once; others within CACHE_MS
  return getHomepageTraffic(db, definition);
}

// ---- Middleware read path: short in-process cache, fail-open to the coded split ----
const CACHE_MS = 15_000;
let trafficCache: { at: number; value: HomepageTraffic | null } | null = null;

/** For the middleware: cached ≤15s; null on any DB error (callers then use the coded allocation). */
export async function getHomepageTrafficCached(now = Date.now()): Promise<HomepageTraffic | null> {
  if (trafficCache && now - trafficCache.at < CACHE_MS) return trafficCache.value;
  let value: HomepageTraffic | null = null;
  try {
    value = await getHomepageTraffic();
  } catch {
    value = null;
  }
  trafficCache = { at: now, value };
  return value;
}
