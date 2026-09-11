import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { createTestDb, user, billingAccounts, creditGrants, type Database } from "@podway/db";
import type Stripe from "stripe";
import { BillingService } from "../src/billing.js";

// Stripe must look "configured" (test mode, never live) so the guarded reads run. The BillingService
// gets an INJECTED fake Stripe, so no real key or network is ever touched.
beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  delete process.env.STRIPE_LIVE_MODE;
});

let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  if (close) await close();
  close = null;
});

async function freshDb(): Promise<Database> {
  const { db, close: c } = await createTestDb();
  close = c;
  return db;
}

const now = new Date();
async function seedAccount(db: Database, ownerId: string, customerId: string | null, hasCard = true) {
  await db.insert(user).values({ id: ownerId, name: ownerId, email: `${ownerId}@example.com` });
  if (customerId) {
    await db.insert(billingAccounts).values({ ownerId, stripeCustomerId: customerId, hasCard, createdAt: now, updatedAt: now });
  }
}

/** A minimal fake Stripe — only the methods the read/detach paths touch. */
function fakeStripe(overrides: Record<string, unknown>): Stripe {
  return overrides as unknown as Stripe;
}

describe("BillingService.getPaymentMethod", () => {
  it("returns null when the owner has no Stripe customer", async () => {
    const db = await freshDb();
    await seedAccount(db, "u1", null);
    const svc = new BillingService(db, fakeStripe({}));
    expect(await svc.getPaymentMethod("u1")).toBeNull();
  });

  it("returns the default card's brand/last4/expiry", async () => {
    const db = await freshDb();
    await seedAccount(db, "u1", "cus_1");
    const svc = new BillingService(
      db,
      fakeStripe({
        customers: { retrieve: async () => ({ invoice_settings: { default_payment_method: "pm_1" } }) },
        paymentMethods: {
          retrieve: async (id: string) => ({ id, card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 } }),
        },
      }),
    );
    expect(await svc.getPaymentMethod("u1")).toEqual({ brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 });
  });

  it("falls back to the first saved card when there is no invoice-settings default", async () => {
    const db = await freshDb();
    await seedAccount(db, "u1", "cus_1");
    const svc = new BillingService(
      db,
      fakeStripe({
        customers: { retrieve: async () => ({ invoice_settings: { default_payment_method: null } }) },
        paymentMethods: {
          list: async () => ({ data: [{ id: "pm_9" }] }),
          retrieve: async (id: string) => ({ id, card: { brand: "amex", last4: "0005", exp_month: 1, exp_year: 2029 } }),
        },
      }),
    );
    expect(await svc.getPaymentMethod("u1")).toEqual({ brand: "amex", last4: "0005", expMonth: 1, expYear: 2029 });
  });

  it("returns null (never throws) on a Stripe error", async () => {
    const db = await freshDb();
    await seedAccount(db, "u1", "cus_1");
    const svc = new BillingService(
      db,
      fakeStripe({ customers: { retrieve: async () => { throw new Error("stripe down"); } } }),
    );
    expect(await svc.getPaymentMethod("u1")).toBeNull();
  });
});

describe("BillingService.detachPaymentMethod", () => {
  it("detaches every saved card and clears the has-card mirror", async () => {
    const db = await freshDb();
    await seedAccount(db, "u1", "cus_1", true);
    const detached: string[] = [];
    const svc = new BillingService(
      db,
      fakeStripe({
        paymentMethods: {
          list: async () => ({ data: [{ id: "pm_1" }, { id: "pm_2" }] }),
          detach: async (id: string) => { detached.push(id); return { id }; },
        },
      }),
    );
    await svc.detachPaymentMethod("u1");
    expect(detached).toEqual(["pm_1", "pm_2"]);
    expect((await svc.getAccount("u1")).hasCard).toBe(false);
  });

  it("is a no-op when there is no Stripe customer", async () => {
    const db = await freshDb();
    await seedAccount(db, "u1", null);
    const svc = new BillingService(db, fakeStripe({}));
    await expect(svc.detachPaymentMethod("u1")).resolves.toBeUndefined();
  });
});

describe("BillingService.listInvoices", () => {
  it("maps amount_paid and the hosted receipt url", async () => {
    const db = await freshDb();
    await seedAccount(db, "u1", "cus_1");
    const svc = new BillingService(
      db,
      fakeStripe({
        invoices: {
          list: async () => ({
            data: [
              { id: "in_1", number: "A-1", amount_due: 1200, amount_paid: 200, status: "paid", created: 1700000000, hosted_invoice_url: "https://stripe/in_1" },
            ],
          }),
        },
      }),
    );
    const rows = await svc.listInvoices("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amountPaidCents: 200, amountDueCents: 1200, url: "https://stripe/in_1", status: "paid" });
  });

  it("returns [] when there is no Stripe customer", async () => {
    const db = await freshDb();
    await seedAccount(db, "u1", null);
    const svc = new BillingService(db, fakeStripe({}));
    expect(await svc.listInvoices("u1")).toEqual([]);
  });
});

describe("BillingService.listCreditGrants", () => {
  it("returns grants newest first with cents + reason", async () => {
    const db = await freshDb();
    await seedAccount(db, "u1", "cus_1");
    await db.insert(creditGrants).values([
      { id: "g1", ownerId: "u1", cents: 1500, reason: "signup", createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "g2", ownerId: "u1", cents: 1000, reason: "referral_referred", createdAt: new Date("2026-02-01T00:00:00Z") },
    ]);
    const svc = new BillingService(db, fakeStripe({}));
    const grants = await svc.listCreditGrants("u1");
    expect(grants.map((g) => g.reason)).toEqual(["referral_referred", "signup"]);
    expect(grants[0]).toMatchObject({ cents: 1000, reason: "referral_referred" });
  });
});

describe("BillingService.getReferralStatus", () => {
  it("counts joined / pending / earned from user.ref and the grants ledger", async () => {
    const db = await freshDb();
    // Owner u1 referred u2 and u3; a self-ref (u1) must not count.
    await db.insert(user).values([
      { id: "u1", name: "u1", email: "u1@example.com", ref: "u1" },
      { id: "u2", name: "u2", email: "u2@example.com", ref: "u1" },
      { id: "u3", name: "u3", email: "u3@example.com", ref: "u1" },
      { id: "u4", name: "u4", email: "u4@example.com", ref: "someoneElse" },
    ]);
    // One matured referrer payout landed (for u2).
    await db.insert(creditGrants).values([
      { id: "g1", ownerId: "u1", cents: 1000, reason: "referral_referrer:u2", createdAt: now },
      { id: "g2", ownerId: "u1", cents: 1500, reason: "signup", createdAt: now },
    ]);
    const svc = new BillingService(db, fakeStripe({}));
    expect(await svc.getReferralStatus("u1")).toEqual({ joined: 2, pending: 1, earned: 1, earnedCents: 1000 });
  });

  it("is all-zero for an account with no referrals", async () => {
    const db = await freshDb();
    await seedAccount(db, "u1", "cus_1");
    const svc = new BillingService(db, fakeStripe({}));
    expect(await svc.getReferralStatus("u1")).toEqual({ joined: 0, pending: 0, earned: 0, earnedCents: 0 });
  });
});

describe("BillingService.getNextChargeDate", () => {
  it("returns null when there is no Stripe customer", async () => {
    const db = await freshDb();
    await seedAccount(db, "u1", null);
    const svc = new BillingService(db, fakeStripe({}));
    expect(await svc.getNextChargeDate("u1")).toBeNull();
  });

  it("reads current_period_end from the active subscription", async () => {
    const db = await freshDb();
    await seedAccount(db, "u1", "cus_1");
    const svc = new BillingService(
      db,
      fakeStripe({
        subscriptions: {
          list: async () => ({ data: [{ id: "sub_1", status: "active", current_period_end: 1800000000, items: { data: [] } }] }),
        },
      }),
    );
    expect(await svc.getNextChargeDate("u1")).toBe(1800000000);
  });

  it("returns null (never throws) on a Stripe error", async () => {
    const db = await freshDb();
    await seedAccount(db, "u1", "cus_1");
    const svc = new BillingService(
      db,
      fakeStripe({ subscriptions: { list: async () => { throw new Error("boom"); } } }),
    );
    expect(await svc.getNextChargeDate("u1")).toBeNull();
  });
});
