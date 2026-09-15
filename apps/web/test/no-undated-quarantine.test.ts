import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Quarantine discipline. A skipped test is invisible debt — the Experiments e2e sat `test.skip`
 * (quarantined) and rotted for weeks while reading as coverage. So an UNCONDITIONAL skip
 * (`test.skip("title", …)`, not the legitimate env-conditional `test.skip(cond, "reason")`) MUST
 * carry a `@quarantine-until: YYYY-MM-DD` on the line above, and that date must be in the FUTURE — a
 * quarantine that isn't fixed by its date fails CI, forcing a decision (fix it, or consciously extend).
 *
 * Scans the e2e specs and the web unit tests. There should be ZERO quarantines right now; this guard
 * keeps it that way.
 */
const testRoot = path.dirname(fileURLToPath(import.meta.url));
const dirs = [testRoot, path.join(testRoot, "..", "e2e")];

// Anchored to line start (after indentation) so a `.skip("…")` mentioned in a COMMENT or docstring
// isn't mistaken for a real quarantine — only an actual test declaration counts.
const QUARANTINE_RE = /^\s*(?:test|it|describe)\.skip\(\s*["'`]/;
const UNTIL_RE = /@quarantine-until:\s*(\d{4}-\d{2}-\d{2})/;

function testFiles(): string[] {
  const out: string[] = [];
  for (const dir of dirs) {
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".test.ts") || f.endsWith(".spec.ts")) out.push(path.join(dir, f));
    }
  }
  return out;
}

describe("no undated or expired quarantined tests", () => {
  const files = testFiles();
  const today = new Date().toISOString().slice(0, 10);

  it("discovers the test files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const file of files) {
    const rel = path.relative(path.join(testRoot, ".."), file);
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!QUARANTINE_RE.test(line)) return;
      it(`${rel}:${i + 1} — quarantine has a future @quarantine-until date`, () => {
        const context = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
        const m = context.match(UNTIL_RE);
        expect(
          m,
          `an unconditional .skip() at ${rel}:${i + 1} has no '@quarantine-until: YYYY-MM-DD' on the ` +
            `lines above it. A quarantine must state when it will be fixed (or fixed by then).`,
        ).not.toBeNull();
        expect(
          m![1]! >= today,
          `the quarantine at ${rel}:${i + 1} expired on ${m![1]} — fix the test or consciously ` +
            `extend the date (do not let a skipped test rot, as the Experiments e2e did).`,
        ).toBe(true);
      });
    });
  }
});
