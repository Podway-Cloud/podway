import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { createTestDb, user, billingAccounts, creditGrants, eq, type Database } from "@podway/db";
import type Stripe from "stripe";
import { BillingService, REFERRAL_CENTS } from "../src/billing.js";

/**
 * The MONEY-MOVING half of BillingService — grantCredit (the ledger + mirror + Stripe balance push),
 * the referral economics, and the webhook (handleEvent). The existing billing.test.ts covers the READ
 * paths; these cover the WRITES, which is where "green ≠ the money is right" bit (billing.ts was 45%).
 * Real Postgres (PGlite) + an injected fake Stripe — no real key, no network.
 */
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
async function seedUser(
  db: Database,
  id: string,
  opts: { ref?: string; createdAt?: Date } = {},
): Promise<void> {
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    ref: opts.ref ?? null,
    createdAt: opts.createdAt ?? new Date(),
  });
}
async function seedAccount(db: Database, ownerId: string, customerId: string | null, hasCard = false) {
  const now = new Date();
  await db
    .insert(billingAccounts)
    .values({ ownerId, stripeCustomerId: customerId, hasCard, createdAt: now, updatedAt: now });
}
function fakeStripe(o: Record<string, unknown>): Stripe {
  return o as unknown as Stripe;
}
/** A fake with a spyable balance-transaction + customer create (for ensureCustomer). */
function grantStripe() {
  const createBalanceTransaction = vi.fn(async () => ({}));
  const create = vi.fn(async () => ({ id: "cus_new" }));
  return { spy: createBalanceTransaction, create, stripe: fakeStripe({ customers: { createBalanceTransaction, create } }) };
}

describe("test→live customer cutover (No such customer)", () => {
  const staleErr = () =>
    Object.assign(new Error("No such customer: 'cus_stale'"), { code: "resource_missing" });

  it("listInvoices survives a stale (test-mode) customer and forgets it", async () => {
    const db = await freshDb();
    await seedUser(db, "u1");
    await seedAccount(db, "u1", "cus_stale", true);
    const list = vi.fn(async () => {
      throw staleErr();
    });
    const svc = new BillingService(db, fakeStripe({ invoices: { list } }));

    expect(await svc.listInvoices("u1")).toEqual([]); // no crash

    const acct = await db.select().from(billingAccounts).where(eq(billingAccounts.ownerId, "u1"));
    expect(acct[0].stripeCustomerId).toBeNull(); // stale id forgotten
    expect(acct[0].hasCard).toBe(false);
  });

  it("ensureCustomer recreates when the stored customer is gone in the current mode", async () => {
    const db = await freshDb();
    await seedUser(db, "u1");
    await seedAccount(db, "u1", "cus_stale", true);
    const retrieve = vi.fn(async () => {
      throw staleErr();
    });
    const create = vi.fn(async () => ({ id: "cus_live_new" }));
    const svc = new BillingService(db, fakeStripe({ customers: { retrieve, create } }));

    expect(await svc.ensureCustomer("u1", "u1@example.com")).toBe("cus_live_new");
    expect(create).toHaveBeenCalledTimes(1);

    const acct = await db.select().from(billingAccounts).where(eq(billingAccounts.ownerId, "u1"));
    expect(acct[0].stripeCustomerId).toBe("cus_live_new");
  });

  it("re-applies the ledger credit onto a re-created customer (so the $15 isn't stranded)", async () => {
    const db = await freshDb();
    await seedUser(db, "u1");
    await seedAccount(db, "u1", "cus_stale", true);
    // A signup credit already earned (granted in test mode → on the OLD customer).
    await db.insert(creditGrants).values({ id: "g1", ownerId: "u1", cents: 1500, reason: "signup" });
    const retrieve = vi.fn(async () => {
      throw staleErr();
    });
    const create = vi.fn(async () => ({ id: "cus_live_new" }));
    const createBalanceTransaction = vi.fn(async () => ({}));
    const svc = new BillingService(
      db,
      fakeStripe({ customers: { retrieve, create, createBalanceTransaction } }),
    );

    await svc.ensureCustomer("u1", "u1@example.com");

    // The credit is re-pushed onto the FRESH customer, not left on the stale one.
    expect(createBalanceTransaction).toHaveBeenCalledWith(
      "cus_live_new",
      expect.objectContaining({ amount: -1500 }),
    );
  });
});

describe("grantCredit", () => {
  it("records a ledger row, bumps the mirror, and pushes a NEGATIVE Stripe balance txn", async () => {
    const db = await freshDb();
    await seedUser(db, "u1");
    await seedAccount(db, "u1", "cus_1");
    const { spy, stripe } = grantStripe();
    const svc = new BillingService(db, stripe);

    expect(await svc.grantCredit("u1", 1500, "signup")).toBe(true);

    const grants = await db.select().from(creditGrants).where(eq(creditGrants.ownerId, "u1"));
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ cents: 1500, reason: "signup" });

    const acct = await db.select().from(billingAccounts).where(eq(billingAccounts.ownerId, "u1"));
    expect(acct[0]!.creditCents).toBe(1500);

    expect(spy).toHaveBeenCalledWith("cus_1", expect.objectContaining({ amount: -1500, currency: "usd" }));
  });

  it("is idempotent per (owner, reason): a repeat grant does NOT double-credit", async () => {
    const db = await freshDb();
    await seedUser(db, "u1");
    await seedAccount(db, "u1", "cus_1");
    const { spy, stripe } = grantStripe();
    const svc = new BillingService(db, stripe);

    expect(await svc.grantCredit("u1", 1500, "signup")).toBe(true);
    expect(await svc.grantCredit("u1", 1500, "signup")).toBe(false); // same reason → no-op

    const acct = await db.select().from(billingAccounts).where(eq(billingAccounts.ownerId, "u1"));
    expect(acct[0]!.creditCents).toBe(1500); // NOT 3000
    expect(spy).toHaveBeenCalledTimes(1); // Stripe hit once
  });

  it("refuses a non-positive amount and when Stripe is unconfigured", async () => {
    const db = await freshDb();
    await seedUser(db, "u1");
    await seedAccount(db, "u1", "cus_1");
    const { spy, stripe } = grantStripe();
    const svc = new BillingService(db, stripe);

    expect(await svc.grantCredit("u1", 0, "x")).toBe(false);
    expect(await svc.grantCredit("u1", -500, "y")).toBe(false);

    delete process.env.STRIPE_SECRET_KEY;
    expect(await svc.grantCredit("u1", 1000, "z")).toBe(false);
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";

    expect(spy).not.toHaveBeenCalled();
    expect(await db.select().from(creditGrants)).toHaveLength(0);
  });
});

describe("referral credit", () => {
  it("grantReferralReferred credits the referred side when referred by a real user", async () => {
    const db = await freshDb();
    await seedUser(db, "ref1");
    await seedUser(db, "u1", { ref: "ref1" });
    await seedAccount(db, "u1", "cus_1");
    const { stripe } = grantStripe();
    const svc = new BillingService(db, stripe);

    expect(await svc.grantReferralReferred("u1")).toBe(true);
    const grants = await db.select().from(creditGrants).where(eq(creditGrants.ownerId, "u1"));
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ cents: REFERRAL_CENTS, reason: "referral_referred" });
  });

  it("grantReferralReferred is a no-op with no referrer, or a self-referral", async () => {
    const db = await freshDb();
    await seedUser(db, "u1"); // no ref
    await seedUser(db, "u2", { ref: "u2" }); // self-referral
    await seedAccount(db, "u1", "cus_1");
    await seedAccount(db, "u2", "cus_2");
    const { stripe } = grantStripe();
    const svc = new BillingService(db, stripe);

    expect(await svc.grantReferralReferred("u1")).toBe(false);
    expect(await svc.grantReferralReferred("u2")).toBe(false);
    expect(await db.select().from(creditGrants)).toHaveLength(0);
  });
});

describe("handleEvent (webhook)", () => {
  const ev = (type: string, object: Record<string, unknown>): Stripe.Event =>
    ({ type, data: { object } }) as unknown as Stripe.Event;

  it("payment_method.attached makes the has-card mirror authoritative", async () => {
    const db = await freshDb();
    await seedUser(db, "u1");
    await seedAccount(db, "u1", "cus_1", false);
    const svc = new BillingService(db, fakeStripe({}));

    expect(await svc.handleEvent(ev("payment_method.attached", { customer: "cus_1" }))).toEqual({
      handled: "payment_method.attached",
    });
    const acct = await db.select().from(billingAccounts).where(eq(billingAccounts.ownerId, "u1"));
    expect(acct[0]!.hasCard).toBe(true);
  });

  it("invoice.payment_failed kicks the onPaymentFailed hook with the owner", async () => {
    const db = await freshDb();
    await seedUser(db, "u1");
    await seedAccount(db, "u1", "cus_1", true);
    const svc = new BillingService(db, fakeStripe({}));
    const hook = vi.fn(async () => {});
    svc.onPaymentFailed = hook;

    await svc.handleEvent(ev("invoice.payment_failed", { customer: "cus_1" }));
    expect(hook).toHaveBeenCalledWith("u1");
  });

  it("invoice.paid pays a MATURE referrer their referral credit", async () => {
    const db = await freshDb();
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days → mature (>30)
    await seedUser(db, "ref1");
    await seedUser(db, "u1", { ref: "ref1", createdAt: old });
    await seedAccount(db, "u1", "cus_1", true);
    await seedAccount(db, "ref1", "cus_ref", true);
    const { spy, stripe } = grantStripe();
    const svc = new BillingService(db, stripe);

    await svc.handleEvent(ev("invoice.paid", { customer: "cus_1", amount_paid: 1200 }));

    const refGrants = await db.select().from(creditGrants).where(eq(creditGrants.ownerId, "ref1"));
    expect(refGrants).toHaveLength(1);
    expect(refGrants[0]).toMatchObject({ cents: REFERRAL_CENTS, reason: "referral_referrer:u1" });
    expect(spy).toHaveBeenCalledWith("cus_ref", expect.objectContaining({ amount: -REFERRAL_CENTS }));
  });

  it("invoice.paid does NOT pay an IMMATURE referrer", async () => {
    const db = await freshDb();
    await seedUser(db, "ref1");
    await seedUser(db, "u1", { ref: "ref1", createdAt: new Date() }); // brand new → not mature
    await seedAccount(db, "u1", "cus_1", true);
    await seedAccount(db, "ref1", "cus_ref", true);
    const { stripe } = grantStripe();
    const svc = new BillingService(db, stripe);

    await svc.handleEvent(ev("invoice.paid", { customer: "cus_1", amount_paid: 1200 }));
    expect(await db.select().from(creditGrants).where(eq(creditGrants.ownerId, "ref1"))).toHaveLength(0);
  });

  it("ignores an unknown event type", async () => {
    const db = await freshDb();
    const svc = new BillingService(db, fakeStripe({}));
    expect(await svc.handleEvent(ev("customer.updated", {}))).toEqual({ handled: "ignored:customer.updated" });
  });
});

describe("syncSubscription never charges before a card is on file", () => {
  it("skips with no-card when the account has no card", async () => {
    const db = await freshDb();
    await seedUser(db, "u1");
    await seedAccount(db, "u1", "cus_1", false);
    const svc = new BillingService(db, fakeStripe({}));
    expect(await svc.syncSubscription("u1", [{ podId: "p1", size: "m", status: "running" }])).toEqual({
      skipped: "no-card",
    });
  });

  it("skips with stripe-off when Stripe is unconfigured", async () => {
    const db = await freshDb();
    await seedUser(db, "u1");
    await seedAccount(db, "u1", "cus_1", true);
    const svc = new BillingService(db, fakeStripe({}));
    delete process.env.STRIPE_SECRET_KEY;
    expect(await svc.syncSubscription("u1", [])).toEqual({ skipped: "stripe-off" });
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  });
});

describe("syncSubscription — the charge orchestration", () => {
  /** A fake Stripe modelling prices + subscriptions for syncSubscription. */
  function subStripe(existingSubs: unknown[] = []) {
    const create = vi.fn(async (p: { items: unknown[] }) => ({ id: "sub_new", ...p }));
    const cancel = vi.fn(async () => ({}));
    const list = vi.fn(async () => ({ data: existingSubs }));
    // ensurePrices lists by lookup_key; return a price id per requested key so nothing is created.
    const pricesList = vi.fn(async ({ lookup_keys }: { lookup_keys: string[] }) => ({
      data: lookup_keys.map((lk) => ({ lookup_key: lk, id: `price_${lk}` })),
    }));
    const stripe = fakeStripe({
      customers: { create: async () => ({ id: "cus_new" }) },
      prices: { list: pricesList, create: vi.fn() },
      subscriptions: { list, create, cancel },
      subscriptionItems: { create: vi.fn(), update: vi.fn(), del: vi.fn() },
    });
    return { create, cancel, list, stripe };
  }

  it("creates a subscription with the right per-pod price when there is none", async () => {
    const db = await freshDb();
    await seedUser(db, "u1");
    await seedAccount(db, "u1", "cus_1", true);
    const { create, stripe } = subStripe([]);
    const svc = new BillingService(db, stripe);

    const r = await svc.syncSubscription("u1", [{ podId: "p1", size: "m", status: "running" }]);
    expect(r).toMatchObject({ subscriptionId: "sub_new", items: 1 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_1",
        items: [expect.objectContaining({ price: "price_podway_m_monthly_v1", metadata: { podId: "p1" } })],
      }),
    );
  });

  it("prices a SUSPENDED pod at the suspended rate, not its size", async () => {
    const db = await freshDb();
    await seedUser(db, "u1");
    await seedAccount(db, "u1", "cus_1", true);
    const { create, stripe } = subStripe([]);
    const svc = new BillingService(db, stripe);

    await svc.syncSubscription("u1", [{ podId: "p1", size: "l", status: "suspended" }]);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ price: "price_podway_suspended_monthly_v1" })],
      }),
    );
  });

  it("cancels the subscription when the account has no billable pods", async () => {
    const db = await freshDb();
    await seedUser(db, "u1");
    await seedAccount(db, "u1", "cus_1", true);
    const { cancel, stripe } = subStripe([{ id: "sub_1", status: "active", items: { data: [] } }]);
    const svc = new BillingService(db, stripe);

    const r = await svc.syncSubscription("u1", [{ podId: "p1", size: "m", status: "gone" }]);
    expect(cancel).toHaveBeenCalledWith("sub_1");
    expect(r).toMatchObject({ items: 0 });
  });
});
