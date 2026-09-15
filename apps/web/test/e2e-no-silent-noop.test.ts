import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guard against the SILENT NO-OP class of e2e test — a test that passes having asserted nothing.
 * Two shapes, both found live during the test-reliability audit:
 *   1. A test body with no `expect(` at all (it navigates/clicks but verifies nothing).
 *   2. An assertion wrapped in `if (await <locator>.count())` — a stale selector makes the count 0,
 *      the block is skipped, and the test goes green (the `admin-pages` sortable-table test did this).
 * Both read as coverage while proving nothing. This meta-test fails on either, across all e2e specs.
 */
const e2eDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "e2e");

// Intentionally assertion-free tests, each with a reason. These CAPTURE screenshots for manual review
// (page.screenshot to a file), not regression assertions. Keep this SMALL; ideally these grow a real
// assertion or move to toHaveScreenshot baselines (tracked in the test-reliability change).
const ALLOWLIST = new Set<string>([
  "VISUAL walkthrough + terminal stats",
  "VISUAL mobile — launch wizard, walkthrough, github wizard",
  "VISUAL github → clone into a non-empty ~/work → confirm overwrite",
  "VISUAL settings relay ⓘ explains the relay",
]);

function specFiles(): string[] {
  return readdirSync(e2eDir).filter((f) => f.endsWith(".spec.ts"));
}

/** Split a spec into (title, body) per test block. Body runs to the next test declaration or EOF. */
function testBlocks(src: string): { title: string; body: string }[] {
  const re = /\btest(?:\.(?:skip|only|fixme))?\(\s*["'`]([^"'`]+)["'`]/g;
  const starts: { title: string; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) starts.push({ title: m[1]!, at: m.index });
  return starts.map((s, i) => ({
    title: s.title,
    body: src.slice(s.at, i + 1 < starts.length ? starts[i + 1]!.at : src.length),
  }));
}

describe("e2e specs contain no silent no-op tests", () => {
  const files = specFiles();

  it("discovers the e2e specs", () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  for (const file of files) {
    const src = readFileSync(path.join(e2eDir, file), "utf8");

    it(`${file} has no assertion inside an 'if (await …count())' guard`, () => {
      // The silent-skip pattern: a stale selector → count 0 → assertion skipped → green.
      expect(
        /if \(await [^)]*\.count\(\)\)/.test(src),
        `${file} wraps logic in 'if (await …count())' — a stale selector silently skips it. ` +
          `Assert presence directly (expect(...).toBeVisible()/toHaveCount()).`,
      ).toBe(false);
    });

    for (const { title, body } of testBlocks(src)) {
      it(`${file} → "${title}" asserts something`, () => {
        if (ALLOWLIST.has(title)) return;
        expect(
          /\bexpect\(/.test(body),
          `e2e test "${title}" in ${file} contains no expect() — it verifies nothing. Add an ` +
            `assertion, or (if it is a screenshot-capture) add it to ALLOWLIST with a reason.`,
        ).toBe(true);
      });
    }
  }
});
