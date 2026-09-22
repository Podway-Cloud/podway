import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Regression guard for pre-Alpha security H2: a Server Action is a directly-invocable POST,
 * so the /pending page-gate does NOT protect it. The one mutating action that CREATES/spends
 * — launchPod — MUST gate on requireApprovedUser (not bare requireUser), or an authenticated-
 * but-unapproved user can provision pods straight past the invite gate.
 */
const libDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib");
const src = readFileSync(path.join(libDir, "actions.ts"), "utf8");
const billingActions = readFileSync(path.join(libDir, "billing-actions.ts"), "utf8");
const billingSync = readFileSync(path.join(libDir, "billing-sync.ts"), "utf8");

/** Slice one `export async function <name>(` body out of a source string. */
function fnBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  expect(start, `${name} must exist`).toBeGreaterThan(-1);
  const rest = source.slice(start);
  return rest.slice(0, rest.indexOf("\n}\n") + 2);
}

describe("server-action approval gate (H2)", () => {
  it("launchPod gates on requireApprovedUser, not bare requireUser", () => {
    const fn = fnBody(src, "launchPod");
    expect(fn).toContain("requireApprovedUser()");
    expect(fn).not.toMatch(/const user = await requireUser\(\)/);
  });

  // NOTE: startAddCard + markCardSaved were source-scanned here; they are now proven at RUNTIME
  // (they refuse when the approval gate rejects, and never touch Stripe/credit) in
  // action-gate-runtime.test.ts. And EVERY "use server" action is checked for a gate by
  // ungated-action-meta.test.ts — so a newly-added ungated action fails without a per-action edit here.

  it("syncOwnerBilling (takes a caller-supplied ownerId) is NOT a directly-invocable action", () => {
    // It must not be exported from a "use server" module — that exposed it as a POST anyone could call
    // against ANY owner's Stripe account. It lives in billing-sync.ts (server-only, no "use server").
    expect(billingActions).not.toMatch(/export async function syncOwnerBilling/);
    expect(billingSync).toContain('import "server-only"');
    // No "use server" DIRECTIVE line (a mid-comment mention is fine).
    expect(billingSync).not.toMatch(/^\s*["']use server["'];?\s*$/m);
    expect(billingSync).toMatch(/export async function syncOwnerBilling/);
  });
});
