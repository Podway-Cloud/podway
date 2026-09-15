import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * COMPLETENESS guard for the H2 class of bug: a `"use server"` module exposes every exported async
 * function as a directly-invocable POST, so a page/layout gate does NOT protect it. Each such action
 * must enforce an access gate itself. The per-action tests in `action-auth-gate.test.ts` check the
 * KNOWN sensitive ones by name; this test checks EVERY action and FAILS when a NEW one ships without a
 * gate — the gap a per-name test can never catch (audit: "a new ungated action passes green").
 *
 * This is a completeness check, not a runtime-correctness check: it proves a gate CALL is present, not
 * that the gate's logic is right (that is covered at runtime in access-gate-runtime.test.ts). Its job
 * is to make "add a server action" force a conscious access decision, every time.
 */
const libDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib");

// Recognised gate entry-points: the three gates, plus helpers that THEMSELVES gate (they call a
// require* and add owner-scoping). Adding a new gate helper here is a conscious, reviewed step.
const GATE_RE = /\brequire(ApprovedUser|Admin|User)\(\)|\bassertOwnedPod\(/;

// Intentionally-ungated actions, each with a reason. Keep this SMALL; an entry is a security decision.
const ALLOWLISTED: Record<string, string> = {
  billingEnabled: "pure static config read (!billingOff()), no user data, no mutation, no owner scope",
};

function useServerModules(): string[] {
  return readdirSync(libDir)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => /^\s*["']use server["'];?\s*$/m.test(readFileSync(path.join(libDir, f), "utf8")));
}

function exportedActions(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /export async function ([a-zA-Z0-9_]+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const rest = src.slice(m.index);
    const end = rest.indexOf("\n}\n");
    out.push({ name: m[1]!, body: rest.slice(0, end < 0 ? rest.length : end + 2) });
  }
  return out;
}

describe("every 'use server' action enforces an access gate", () => {
  const modules = useServerModules();

  it("discovers the use-server action modules", () => {
    // A drop to ~0 means the discovery glob broke (e.g. a lint reformat of the directive) — which
    // would silently disable this whole guard. Anchor it.
    expect(modules.length).toBeGreaterThanOrEqual(8);
  });

  for (const file of modules) {
    const src = readFileSync(path.join(libDir, file), "utf8");
    for (const { name, body } of exportedActions(src)) {
      it(`${file} → ${name} gates on a require*()/owner helper (or is allowlisted)`, () => {
        if (name in ALLOWLISTED) return;
        expect(
          GATE_RE.test(body),
          `${name} in ${file} is a directly-invocable server action with NO access gate. Add ` +
            `requireUser()/requireApprovedUser()/requireAdmin() (or an owner-scoping helper), or — if ` +
            `it is genuinely safe to expose ungated — add it to ALLOWLISTED with a reason.`,
        ).toBe(true);
      });
    }
  }
});
