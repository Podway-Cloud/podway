import { describe, it, expect, vi, beforeEach } from "vitest";
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

vi.mock("@/lib/access-rules", () => ({ isAdmin: (e: string) => isAdmin(e) }));
vi.mock("@/lib/session", () => ({ editionOss: () => editionOss() }));
vi.mock("@/lib/pod-service", () => ({ getBillingService: () => ({ getAccount }) }));
vi.mock("@podway/control-plane", () => ({ stripeConfigured: () => stripeConfigured() }));

const { accountRamCapGb } = await import("@/lib/account-limits");

describe("accountRamCapGb", () => {
  beforeEach(() => {
    isAdmin.mockReturnValue(false);
    editionOss.mockReturnValue(false);
    stripeConfigured.mockReturnValue(true);
    getAccount.mockResolvedValue({ hasCard: false });
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

  it("falls back to the free budget if the billing lookup fails", async () => {
    getAccount.mockRejectedValue(new Error("stripe down"));
    expect(await accountRamCapGb("u1", "user@example.com")).toBe(ACCOUNT_RAM_GB);
  });

  it("carded budget is actually higher than the free budget", () => {
    expect(CARDED_RAM_GB).toBeGreaterThan(ACCOUNT_RAM_GB);
  });
});
