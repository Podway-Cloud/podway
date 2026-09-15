import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { migratePgUrl } from "../src/index.js";

/**
 * The SELF-HOST migration path — `migratePgUrl` runs the drizzle SQL against a REAL Postgres (what
 * `packages/selfhost/migrate-pg.mjs` and the serve daemon call). The rest of the db suite runs on
 * PGlite; this is the only test that exercises the actual Postgres path the OSS edition ships. It
 * creates a throwaway database, migrates it, and asserts the schema landed and a re-run is idempotent.
 *
 * Env-gated on a real PG URL (PODWAY_TEST_PG or the e2e PG) — runs locally and in any CI job that
 * provides a Postgres service; a legitimate capability gate, not a quarantine.
 */
const BASE = process.env.PODWAY_TEST_PG ?? process.env.PODWAY_E2E_PG;
const DB_NAME = `podway_migtest_${Date.now()}`;

function urlWithDb(base: string, name: string): string {
  const u = new URL(base);
  u.pathname = `/${name}`;
  return u.toString();
}

describe.skipIf(!BASE)("migratePgUrl on real Postgres", () => {
  let admin: pg.Client;
  beforeAll(async () => {
    admin = new pg.Client({ connectionString: BASE });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
  });
  afterAll(async () => {
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
  });

  it("applies the drizzle migrations and is idempotent on a re-run", async () => {
    const url = urlWithDb(BASE!, DB_NAME);

    await migratePgUrl(url); // fresh DB → applies every migration
    await migratePgUrl(url); // re-run → must be a no-op, not throw

    // The schema actually landed: core tables + a recent migration's table/column exist.
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      const tables = await c.query<{ table_name: string }>(
        `select table_name from information_schema.tables where table_schema='public'`,
      );
      const names = tables.rows.map((r) => r.table_name);
      expect(names).toContain("pods");
      expect(names).toContain("billing_accounts");
      expect(names).toContain("billing_delinquencies"); // migration 0062 (the safety net)

      const col = await c.query(
        `select 1 from information_schema.columns where table_name='pods' and column_name='nonpayment_suspended_at'`,
      );
      expect(col.rowCount).toBe(1); // the 0062 column on pods
    } finally {
      await c.end();
    }
  });
});
