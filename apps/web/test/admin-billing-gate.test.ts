import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The admin billing surface (page + drill-in + credit-grant action) is cloud-only and admin-only.
 * A Server Action is a directly-invocable POST, so page gating is not enough — the action MUST
 * gate on requireAdmin itself (audit H2). And the pages must self-gate for edition (cloud-only)
 * so self-host never renders a billing operator surface. These guards lock both.
 */
const appDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(path.join(appDir, rel), "utf8");

describe("admin billing surface — gates (source)", () => {
  it("the grant-credit action gates on requireAdmin", () => {
    const src = read("lib/admin-billing-actions.ts");
    expect(src).toContain("await requireAdmin()");
    expect(src).not.toMatch(/await requireUser\(\)/);
  });

  it("the billing list page gates on requireAdmin and is cloud-only", () => {
    const src = read("app/admin/billing/page.tsx");
    expect(src).toContain("await requireAdmin()");
    expect(src).toMatch(/editionOss\(\)\)\s*notFound\(\)/);
  });

  it("the billing drill-in page gates on requireAdmin and is cloud-only", () => {
    const src = read("app/admin/billing/[id]/page.tsx");
    expect(src).toContain("await requireAdmin()");
    expect(src).toMatch(/editionOss\(\)\)\s*notFound\(\)/);
  });
});

// --- behavioral: the grant-credit action's validation + Stripe guard --------------------------

const requireAdmin = vi.fn<() => Promise<{ id: string }>>();
const stripeConfigured = vi.fn<() => boolean>();
const grantCredit = vi.fn<(owner: string, cents: number, reason: string) => Promise<boolean>>();

vi.mock("@/lib/access", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/pod-service", () => ({ getBillingService: () => ({ grantCredit }) }));
vi.mock("@podway/control-plane", () => ({ stripeConfigured: () => stripeConfigured() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { grantCreditAdmin } = await import("@/lib/admin-billing-actions");

describe("grantCreditAdmin", () => {
  beforeEach(() => {
    requireAdmin.mockResolvedValue({ id: "admin1" });
    stripeConfigured.mockReturnValue(true);
    grantCredit.mockResolvedValue(true);
    grantCredit.mockClear();
  });

  it("refuses a non-positive amount and never touches Stripe", async () => {
    expect(await grantCreditAdmin("u1", 0)).toEqual({ ok: false, error: expect.any(String) });
    expect(await grantCreditAdmin("u1", -500)).toMatchObject({ ok: false });
    expect(grantCredit).not.toHaveBeenCalled();
  });

  it("refuses when billing is not configured", async () => {
    stripeConfigured.mockReturnValue(false);
    expect(await grantCreditAdmin("u1", 1000)).toMatchObject({ ok: false });
    expect(grantCredit).not.toHaveBeenCalled();
  });

  it("refuses an absurdly large grant", async () => {
    expect(await grantCreditAdmin("u1", 2_000_00)).toMatchObject({ ok: false });
    expect(grantCredit).not.toHaveBeenCalled();
  });

  it("grants a valid amount with a unique admin reason", async () => {
    const res = await grantCreditAdmin("u1", 1500);
    expect(res).toEqual({ ok: true });
    expect(grantCredit).toHaveBeenCalledTimes(1);
    const [owner, cents, reason] = grantCredit.mock.calls[0];
    expect(owner).toBe("u1");
    expect(cents).toBe(1500);
    expect(reason).toMatch(/^admin:/);
  });

  it("reports a failure instead of throwing if the grant errors", async () => {
    grantCredit.mockRejectedValue(new Error("stripe down"));
    expect(await grantCreditAdmin("u1", 1000)).toMatchObject({ ok: false, error: "stripe down" });
  });
});
