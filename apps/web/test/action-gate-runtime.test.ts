import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Runtime auth-gate tests (test-reliability, task 1.1).
 *
 * The ungated-action meta-test proves every "use server" action *mentions* a gate. THIS test proves
 * the money-moving billing mutations actually REFUSE at runtime when the approval gate rejects —
 * a gate that is present-but-broken (e.g. someone swaps `requireApprovedUser` for a no-op) would
 * pass a source-scan but fail here. We drive the action with an unapproved session and assert it
 * throws BEFORE any Stripe/credit side effect, then that an approved session gets through.
 *
 * (launchPod's runtime conversion is a follow-up — actions.ts has a heavy import graph to fake;
 * its gate is still covered at the token level by the meta-test + action-auth-gate source-scan.)
 */

const requireApprovedUser = vi.fn<() => Promise<{ id: string; email: string }>>();
const stripeConfigured = vi.fn<() => boolean>();
const createSetupIntent = vi.fn<(id: string, email: string) => Promise<{ clientSecret: string }>>();
const setHasCard = vi.fn<(id: string, v: boolean) => Promise<void>>();
const grantSignupCredit = vi.fn<(id: string) => Promise<void>>();
const grantReferralReferred = vi.fn<(id: string) => Promise<void>>();
const syncOwnerBilling = vi.fn<(id: string) => Promise<void>>();

// Mock every module billing-actions.ts imports (the `@/lib/*` alias resolves to the same file the
// source's `./` imports do, so the mock intercepts them). editionOss:false + stripeConfigured:true
// ⇒ billingOff() is false, so the action runs past its config guard and reaches the auth gate.
vi.mock("@/lib/session", () => ({ editionOss: () => false, requireUser: vi.fn() }));
vi.mock("@/lib/access", () => ({ requireApprovedUser: () => requireApprovedUser() }));
vi.mock("@/lib/pod-service", () => ({
  getBillingService: () => ({ createSetupIntent, setHasCard, grantSignupCredit, grantReferralReferred }),
}));
vi.mock("@podway/control-plane", () => ({
  stripeConfigured: () => stripeConfigured(),
  stripePublishableKey: () => "pk_test_x",
}));
vi.mock("@/lib/billing-sync", () => ({ syncOwnerBilling: (id: string) => syncOwnerBilling(id) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { startAddCard, markCardSaved } = await import("@/lib/billing-actions");

const DENIED = new Error("not approved");

describe("billing mutations refuse at runtime when the approval gate rejects (H2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stripeConfigured.mockReturnValue(true); // billing ON, so we actually reach the gate
    createSetupIntent.mockResolvedValue({ clientSecret: "cs_x" });
    setHasCard.mockResolvedValue(undefined);
    grantSignupCredit.mockResolvedValue(undefined);
    grantReferralReferred.mockResolvedValue(undefined);
    syncOwnerBilling.mockResolvedValue(undefined);
  });

  it("startAddCard rejects and never creates a Stripe SetupIntent for an unapproved user", async () => {
    requireApprovedUser.mockRejectedValue(DENIED);
    await expect(startAddCard()).rejects.toThrow("not approved");
    expect(createSetupIntent).not.toHaveBeenCalled();
  });

  it("startAddCard reaches Stripe for an APPROVED user (the gate is a gate, not a wall)", async () => {
    requireApprovedUser.mockResolvedValue({ id: "u1", email: "u@example.com" });
    const res = await startAddCard();
    expect(createSetupIntent).toHaveBeenCalledWith("u1", "u@example.com");
    expect(res).toMatchObject({ clientSecret: "cs_x" });
  });

  it("markCardSaved rejects and grants NO credit for an unapproved user", async () => {
    requireApprovedUser.mockRejectedValue(DENIED);
    await expect(markCardSaved()).rejects.toThrow("not approved");
    expect(setHasCard).not.toHaveBeenCalled();
    expect(grantSignupCredit).not.toHaveBeenCalled();
    expect(grantReferralReferred).not.toHaveBeenCalled();
    expect(syncOwnerBilling).not.toHaveBeenCalled();
  });

  it("markCardSaved grants credit + syncs for an APPROVED user", async () => {
    requireApprovedUser.mockResolvedValue({ id: "u2", email: "u2@example.com" });
    await markCardSaved();
    expect(setHasCard).toHaveBeenCalledWith("u2", true);
    expect(grantSignupCredit).toHaveBeenCalledWith("u2");
    expect(syncOwnerBilling).toHaveBeenCalledWith("u2");
  });

  it("both are inert when billing is OFF — the gate is never even reached", async () => {
    stripeConfigured.mockReturnValue(false); // billingOff() true
    requireApprovedUser.mockRejectedValue(new Error("should not be called"));
    expect(await startAddCard()).toMatchObject({ error: expect.any(String) });
    await markCardSaved(); // returns void, no throw
    expect(requireApprovedUser).not.toHaveBeenCalled();
    expect(createSetupIntent).not.toHaveBeenCalled();
  });
});
