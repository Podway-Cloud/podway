import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Migration BACKWARD-COMPAT guard. One schema serves cloud AND self-host, and during a rollout OLD
 * app code runs against the NEW schema — so a migration must be additive: a non-nullable column with
 * no default, a dropped/renamed column, or a tightened column breaks the running-old-code, and that is
 * exactly the class that broke prod on 0039. This scans the real drizzle/*.sql and FAILS on a risky
 * statement unless the migration is in the reviewed allowlist — so a future destructive migration is a
 * conscious decision, not a silent one. (It does NOT replace running the migrations — see
 * migrate-pg.test.ts — it checks their SHAPE.)
 */
const drizzleDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

/** Migrations with a KNOWN, reviewed destructive statement. An entry is a deliberate exception. */
const ALLOWLIST: Record<string, string> = {
  "0009_magenta_slipstream.sql":
    "DROP TABLE user_agent_credentials — a dead table removed deliberately in pre-alpha (no live data)",
  "0020_marvelous_banshee.sql":
    "ALTER COLUMN size_bytes int→bigint — a WIDENING, backward-compatible (old int values fit)",
};

interface Risk {
  hit: (stmt: string) => boolean;
  why: string;
}
const RISKS: Risk[] = [
  {
    // ADD COLUMN that is NOT NULL with no DEFAULT anywhere in the statement (order-independent — a
    // safe `… DEFAULT x NOT NULL` has the default too). This is the 0039 class.
    hit: (s) => /\badd\s+column\b/i.test(s) && /\bnot\s+null\b/i.test(s) && !/\bdefault\b/i.test(s),
    why: "ADD COLUMN … NOT NULL with no DEFAULT (old rows/code fail)",
  },
  { hit: (s) => /\bdrop\s+column\b/i.test(s), why: "DROP COLUMN (old code still reads it during rollout)" },
  { hit: (s) => /\brename\s+column\b/i.test(s), why: "RENAME COLUMN (old code reads the old name)" },
  { hit: (s) => /alter\s+column[^;]*\bset\s+not\s+null\b/i.test(s), why: "SET NOT NULL on an existing column" },
  { hit: (s) => /alter\s+column[^;]*\btype\b/i.test(s), why: "ALTER COLUMN … TYPE (destructive type change)" },
  { hit: (s) => /\bdrop\s+table\b/i.test(s), why: "DROP TABLE" },
];

function statements(sql: string): string[] {
  // drizzle separates with `--> statement-breakpoint`; also split on `;` so multi-statement files split.
  return sql
    .split(/-->\s*statement-breakpoint|;/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

describe("migrations are backward-compatible (additive)", () => {
  const files = readdirSync(drizzleDir).filter((f) => f.endsWith(".sql"));

  it("finds the migration files", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const file of files) {
    it(`${file} is additive (or allowlisted)`, () => {
      if (file in ALLOWLIST) return;
      const sql = readFileSync(path.join(drizzleDir, file), "utf8");
      for (const stmt of statements(sql)) {
        for (const risk of RISKS) {
          expect(
            risk.hit(stmt),
            `${file} has a NON-additive statement — ${risk.why}. Old code runs against the new schema ` +
              `during a rollout (this broke prod on 0039). Make it additive/nullable, or if it is a ` +
              `reviewed, safe removal add ${file} to ALLOWLIST with a reason.\n  → ${stmt.slice(0, 120)}`,
          ).toBe(false);
        }
      }
    });
  }
});
