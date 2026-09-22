import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Ungated-action meta-test (test-reliability, task 1.3).
 *
 * A `"use server"` module exports Server Actions — each one is a directly-invocable POST, so a page
 * gate does NOT protect it (pre-Alpha audit H2). EVERY exported async function in such a module MUST
 * therefore enforce its own auth: either an inline `requireUser()/requireApprovedUser()/requireAdmin()`
 * call, or a call to a local helper that does (e.g. `assertOwnedPod`). The point of THIS test, over
 * the old per-action source-scan, is that it DISCOVERS every action automatically: a newly-added
 * `"use server"` action that ships without a gate fails here, instead of quietly opening a hole.
 *
 * The escape hatch is an explicit allowlist with a written reason — for the rare action that is
 * legitimately public (a read-only config flag with no user data). Adding to it is a conscious,
 * reviewed choice, which is exactly what a security gate should require.
 */

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Actions that are intentionally NOT auth-gated. Each needs a reason a reviewer can weigh.
// Key: "<file basename>:<action name>". Keep this list SHORT — a mutating action never belongs here.
const ALLOWLIST: Record<string, string> = {
  "billing-actions.ts:billingEnabled":
    "public read-only: returns whether billing is switched on (a config flag); exposes no user data.",
};

const USE_SERVER = /^\s*["']use server["'];?\s*$/m;
const GATE_TOKEN = /\brequire(?:User|ApprovedUser|Admin)\s*\(/;

/** Walk a dir tree for .ts/.tsx files, skipping build/test output. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "test" || name === "e2e") continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** All top-level `function <name>(` boundaries with the body up to the next one (or EOF). */
function functions(src: string): { name: string; exported: boolean; body: string }[] {
  const re = /(export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g;
  const marks: { name: string; exported: boolean; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) marks.push({ name: m[2], exported: Boolean(m[1]), index: m.index });
  return marks.map((mk, i) => ({
    name: mk.name,
    exported: mk.exported,
    body: src.slice(mk.index, i + 1 < marks.length ? marks[i + 1].index : src.length),
  }));
}

const serverFiles = walk(path.join(webRoot, "lib"))
  .concat(walk(path.join(webRoot, "app")))
  .filter((f) => USE_SERVER.test(readFileSync(f, "utf8")));

describe("ungated-action meta-test — every 'use server' action enforces auth", () => {
  it("finds the known 'use server' modules (guards the discovery itself)", () => {
    // A floor so a broken walker (finding nothing) can't make this suite vacuously green.
    expect(serverFiles.length).toBeGreaterThanOrEqual(8);
  });

  it("every exported action is gated (inline, via a gating helper, or explicitly allowlisted)", () => {
    const violations: string[] = [];
    for (const file of serverFiles) {
      const src = readFileSync(file, "utf8");
      const base = path.basename(file);
      const fns = functions(src);
      // Local helpers (exported or not) that themselves enforce a gate — an action delegating to one
      // is gated (e.g. custom-domain actions → assertOwnedPod → requireApprovedUser).
      const gaters = new Set(fns.filter((f) => GATE_TOKEN.test(f.body)).map((f) => f.name));
      const callsAGater = (body: string) =>
        [...gaters].some((g) => new RegExp(`\\b${g}\\s*\\(`).test(body));

      for (const fn of fns) {
        if (!fn.exported) continue; // only exported functions are directly-invocable actions
        const key = `${base}:${fn.name}`;
        const gated = GATE_TOKEN.test(fn.body) || callsAGater(fn.body);
        if (!gated && !(key in ALLOWLIST)) {
          violations.push(
            `${key} — exported "use server" action with no auth gate (add requireApprovedUser()/requireAdmin(), route it through a gating helper, or, if truly public, add it to ALLOWLIST with a reason).`,
          );
        }
      }
    }
    expect(violations, `ungated server action(s):\n${violations.join("\n")}`).toEqual([]);
  });

  it("the allowlist has no stale entries (every allowlisted action still exists and is still ungated)", () => {
    const stale: string[] = [];
    for (const key of Object.keys(ALLOWLIST)) {
      const [base, name] = key.split(":");
      const file = serverFiles.find((f) => path.basename(f) === base);
      if (!file) {
        stale.push(`${key} — file no longer a 'use server' module`);
        continue;
      }
      const fn = functions(readFileSync(file, "utf8")).find((f) => f.exported && f.name === name);
      if (!fn) stale.push(`${key} — action no longer exists`);
      else if (GATE_TOKEN.test(fn.body)) stale.push(`${key} — now gated inline; drop the allowlist entry`);
    }
    expect(stale, `stale allowlist entries:\n${stale.join("\n")}`).toEqual([]);
  });
});
