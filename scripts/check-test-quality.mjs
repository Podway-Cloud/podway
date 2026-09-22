#!/usr/bin/env node
// Test-quality guard (test-reliability, task 1.5). Fails CI on the two ways a "test" tests nothing:
//   1. A test body with NO assertion — no expect*/assert*() call and no `no-expect-ok:` waiver.
//   2. An e2e assertion (or its precondition) hidden behind `if (await …count())`, which turns a
//      real regression into a silent pass (the exact bug that let admin-pages.spec sit dead).
// Pure Node, no deps. Run: node scripts/check-test-quality.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TEST_DIRS = ["apps/web/e2e", "apps/web/test", "packages"];
const ASSERTION = /\b(?:expect|assert)\w*\s*\(/; // expect(, expectValidShell(, assert(, assertX(
const WAIVER = /no-expect-ok/; // an explicit, reason-carrying opt-out on a test that validates by other means
const COUNT_GUARD = /\bif\s*\(\s*await\b.*?\.count\(\)\s*\)/; // `if (await …count())` — a silent-skip guard (inner parens ok)

function walk(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === ".next" || name === "fixtures") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(test|spec)\.(ts|tsx|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

/** Body of the it()/test() callback at/after `pos`: the brace opened by `=> {` or `function …) {`. */
function callbackBody(src, pos) {
  const arrow = src.slice(pos).search(/=>\s*\{/);
  const fn = src.slice(pos).search(/function[^{]*\)\s*\{/);
  const cands = [arrow, fn].filter((x) => x >= 0);
  if (!cands.length) return null;
  const rel = Math.min(...cands);
  const start = pos + src.slice(pos + rel).indexOf("{") + rel;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

const files = TEST_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
const violations = [];
const TEST_RE = /\b(?:it|test)\s*(?:\.\w+)?\s*\(\s*[`"']([^`"']*)/g;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);
  let m;
  while ((m = TEST_RE.exec(src))) {
    const body = callbackBody(src, m.index + m[0].length);
    if (body == null) continue; // a `it.each`/table row or a non-callback form — skip
    if (!ASSERTION.test(body) && !WAIVER.test(body)) {
      violations.push(`${rel} — test "${m[1].slice(0, 60)}" has no assertion (add an expect*(), or a "// no-expect-ok: <why>" if it validates by throwing/screenshot).`);
    }
  }
  if (/\.spec\.(ts|tsx)$/.test(file)) {
    const lines = src.split("\n");
    lines.forEach((ln, i) => {
      if (COUNT_GUARD.test(ln) && !WAIVER.test(ln)) {
        violations.push(`${rel}:${i + 1} — assertion/step guarded by \`if (await …count())\` (a missing element must FAIL, not skip; target it directly).`);
      }
    });
  }
}

if (violations.length) {
  console.error(`✗ test-quality: ${violations.length} issue(s)\n` + violations.map((v) => "  " + v).join("\n"));
  process.exit(1);
}
console.log(`✓ test-quality: ${files.length} test files clean (no assertion-free tests, no count()-guarded assertions)`);
