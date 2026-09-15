import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASELINE, loadMigrations, checkMigrations, baselineNames, type SqlClient } from "../src/migrate-prod.js";

/**
 * The DEPLOY-ORDERING guard's decision logic. `check-migrations.sh` runs `migrate-prod --check`
 * against prod and refuses a `web` deploy while any migration is still pending — because web can't
 * run migrations (only the gateway's release_command does), so web-before-gateway ships broken
 * (the 0039 incident). The shell wrapper's fly-proxy plumbing can't run in CI, but its VERDICT is
 * `checkMigrations()` — which we exercise here on a REAL Postgres by seeding the `podway_migrations`
 * ledger to each prod state: missing migrations → pending (→ refuse web), fully applied → clean
 * (→ allow web). (We seed the ledger rather than run the SQL because `runMigrations` deliberately
 * records the pre-baseline schema WITHOUT executing it — prod had it hand-applied — so a from-scratch
 * apply can't build it; migrate-pg.test.ts covers the real apply via drizzle's migrator.)
 *
 * Env-gated on a real PG URL (PODWAY_TEST_PG or the e2e PG); the `migrations` CI job provides an
 * ephemeral Postgres so this actually runs there instead of skipping.
 */
const BASE = process.env.PODWAY_TEST_PG ?? process.env.PODWAY_E2E_PG;
const DB_NAME = `podway_checktest_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const drizzleDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

function urlWithDb(base: string, name: string): string {
  const u = new URL(base);
  u.pathname = `/${name}`;
  return u.toString();
}

describe.skipIf(!BASE)("migrate-prod --check → deploy-ordering guard", () => {
  let admin: pg.Client;
  let db: pg.Client;
  const migrations = loadMigrations(drizzleDir);
  const allNames = migrations.map((m) => m.name);
  const postBaseline = allNames.filter((n) => !baselineNames(migrations).includes(n));
  const check = () => checkMigrations(db as unknown as SqlClient, migrations);

  /** Put the ledger into an exact state: no table at all, or `table` seeded with `names`. */
  async function seedLedger(names: string[] | null, table = "podway_migrations") {
    await db.query(`DROP TABLE IF EXISTS podway_migrations`);
    await db.query(`DROP TABLE IF EXISTS podbay_migrations`);
    if (names === null) return; // fresh DB — neither ledger table exists
    await db.query(`CREATE TABLE ${table} (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    for (const n of names) await db.query(`INSERT INTO ${table}(name) VALUES ($1)`, [n]);
  }

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: BASE });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    db = new pg.Client({ connectionString: urlWithDb(BASE!, DB_NAME) });
    await db.connect();
  });
  afterAll(async () => {
    if (db) await db.end().catch(() => undefined);
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
  });

  it("has real migrations to check, with a baseline inside them", () => {
    expect(migrations.length).toBeGreaterThan(50);
    expect(allNames).toContain(BASELINE);
    expect(postBaseline.length).toBeGreaterThan(0);
  });

  it("a fresh DB (no ledger table) reports EVERY post-baseline migration pending (→ web refused)", async () => {
    await seedLedger(null);
    expect(await check()).toEqual(postBaseline);
  });

  it("a fully-applied ledger reports up to date (→ web allowed)", async () => {
    await seedLedger(allNames);
    expect(await check()).toEqual([]);
  });

  it("a prod ONE migration behind reports exactly that one pending (the 0039 shape)", async () => {
    const last = allNames[allNames.length - 1];
    await seedLedger(allNames.slice(0, -1));
    expect(await check()).toEqual([last]);
  });

  it("reads the OLD podbay_migrations ledger when the renamed one is absent (rename fallback)", async () => {
    // The read-only preflight can run BEFORE the apply that renames the ledger, so it must fall back.
    await seedLedger(allNames, "podbay_migrations");
    expect(await check()).toEqual([]);
  });
});
