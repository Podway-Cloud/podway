import { describe, it, expect, vi, beforeEach } from "vitest";

// Run with PROD's free budget (PODWAY_ACCOUNT_RAM_GB=1, one Mini) so the lead pass is visible.
vi.hoisted(() => {
  process.env.PODWAY_ACCOUNT_RAM_GB = "1";
});
import { ACCOUNT_RAM_GB, CARDED_RAM_GB } from "@podway/shared/tiers";

/**
 * The account RAM budget gate (apps/web/lib/account-limits.ts) is what decides whether the
 * "Create a pod" button is enabled. Before this, a flat ACCOUNT_RAM_GB cap hard-blocked a
 * carded user with credit (velsa: "current users should be able to create a pod when they have
 * credit", 2026-09-14). The fix: a user WITH a card gets the higher CARDED_RAM_GB budget.
 * This locks the branch logic so the block can't silently come back.
 */

const isAdmin = vi.fn<(email: string) => boolean>();
const editionOss = vi.fn<() => boolean>();
const stripeConfigured = vi.fn<() => boolean>();
const getAccount = vi.fn<() => Promise<{ hasCard: boolean }>>();
const getAccountRef = vi.fn<() => Promise<string | null>>();

vi.mock("@/lib/access-rules", () => ({ isAdmin: (e: string) => isAdmin(e) }));
vi.mock("@/lib/session", () => ({ editionOss: () => editionOss() }));
vi.mock("@/lib/pod-service", () => ({ getBillingService: () => ({ getAccount }) }));
vi.mock("@podway/control-plane", () => ({ stripeConfigured: () => stripeConfigured() }));
vi.mock("@/lib/attribution", () => ({ getAccountRef: () => getAccountRef() }));

const { accountRamCapGb } = await import("@/lib/account-limits");

describe("accountRamCapGb", () => {
  beforeEach(() => {
    isAdmin.mockReturnValue(false);
    editionOss.mockReturnValue(false);
    stripeConfigured.mockReturnValue(true);
    getAccount.mockResolvedValue({ hasCard: false });
    getAccountRef.mockResolvedValue(null);
  });

  it("gives a no-card campaign lead (ref email-*) room for one Small, and nobody else", async () => {
    getAccountRef.mockResolvedValue("email-miron");
    expect(ACCOUNT_RAM_GB).toBe(1);
    expect(await accountRamCapGb("u1", "lead@example.com")).toBe(2);
    getAccountRef.mockResolvedValue("selfhost-landing");
    expect(await accountRamCapGb("u1", "user@example.com")).toBe(ACCOUNT_RAM_GB);
    getAccount.mockResolvedValue({ hasCard: true });
    getAccountRef.mockResolvedValue("email-miron");
    expect(await accountRamCapGb("u1", "lead@example.com")).toBe(CARDED_RAM_GB); // a card still wins
  });

  it("is unbounded for an admin", async () => {
    isAdmin.mockReturnValue(true);
    expect(await accountRamCapGb("u1", "admin@podway.io")).toBe(Infinity);
  });

  it("is unbounded on self-host", async () => {
    editionOss.mockReturnValue(true);
    expect(await accountRamCapGb("u1", "owner@example.com")).toBe(Infinity);
  });

  it("is the free budget when billing is off (no Stripe)", async () => {
    stripeConfigured.mockReturnValue(false);
    expect(await accountRamCapGb("u1", "user@example.com")).toBe(ACCOUNT_RAM_GB);
  });

  it("is the higher carded budget for a user WITH a card", async () => {
    getAccount.mockResolvedValue({ hasCard: true });
    expect(await accountRamCapGb("u1", "user@example.com")).toBe(CARDED_RAM_GB);
  });

  it("is the free budget for a user WITHOUT a card", async () => {
    getAccount.mockResolvedValue({ hasCard: false });
    expect(await accountRamCapGb("u1", "user@example.com")).toBe(ACCOUNT_RAM_GB);
  });

  it("the e2e tight-budget switch is INERT without test login (it can never apply in production)", async () => {
    vi.stubEnv("PODWAY_E2E_TIGHT_RAM", "user@example.com=1");
    vi.stubEnv("PODWAY_TEST_LOGIN", "");
    expect(await accountRamCapGb("u1", "user@example.com")).toBe(ACCOUNT_RAM_GB);
    vi.stubEnv("PODWAY_TEST_LOGIN", "1");
    expect(await accountRamCapGb("u1", "user@example.com")).toBe(1);
    expect(await accountRamCapGb("u2", "other@example.com")).toBe(ACCOUNT_RAM_GB); // only that account
    vi.unstubAllEnvs();
  });

  it("falls back to the free budget if the billing lookup fails", async () => {
    getAccount.mockRejectedValue(new Error("stripe down"));
    expect(await accountRamCapGb("u1", "user@example.com")).toBe(ACCOUNT_RAM_GB);
  });

  it("carded budget is actually higher than the free budget", () => {
    expect(CARDED_RAM_GB).toBeGreaterThan(ACCOUNT_RAM_GB);
  });
});
