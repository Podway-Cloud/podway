import { describe, it, expect, afterEach } from "vitest";
import { createTestDb, user, billingDelinquencies, eq, type Database } from "@podway/db";
import { DunningService, DUNNING_GRACE_DAYS, type DunningEmailInfo } from "../src/dunning.js";
import type { BillingService } from "../src/billing.js";
import type { PodService } from "../src/service.js";
import type { PodRecord } from "../src/types.js";

/**
 * The non-payment safety net's rule + clock. Real test DB for the delinquency rows; fakes for
 * BillingService (getAccount / hasOpenInvoice) and PodService (list / suspend / resume), so these
 * exercise the eligibility rule and the grace-day transitions in isolation. The hard constraint —
 * only a delinquent account's OWN pods are suspended — is checked directly.
 */

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

async function seedUser(db: Database, id: string) {
  await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
}

/** A minimal pod record — only the fields the dunning code reads. */
function pod(id: string, ownerId: string, size: string, status = "running"): PodRecord {
  return { id, ownerId, size, status, nonpaymentSuspendedAt: null } as unknown as PodRecord;
}

/** A fake BillingService: fixed account + open-invoice flag per owner. */
function fakeBilling(accounts: Record<string, { creditCents: number; hasCard: boolean; openInvoice?: boolean }>): BillingService {
  return {
    getAccount: async (ownerId: string) => ({
      ownerId,
      stripeCustomerId: null,
      creditCents: accounts[ownerId]?.creditCents ?? 0,
      hasCard: accounts[ownerId]?.hasCard ?? false,
    }),
    hasOpenInvoice: async (ownerId: string) => accounts[ownerId]?.openInvoice ?? false,
  } as unknown as BillingService;
}

/** A fake PodService backed by an in-memory pod list that suspend/resume mutate. */
function fakePods(pods: PodRecord[]) {
  const svc = {
    listAllPods: async () => pods,
    suspendForNonpayment: async (id: string) => {
      const p = pods.find((x) => x.id === id);
      if (!p || p.nonpaymentSuspendedAt || p.status === "suspended") return false;
      p.status = "suspended";
      p.nonpaymentSuspendedAt = new Date().toISOString();
      return true;
    },
    resumeFromNonpayment: async (id: string) => {
      const p = pods.find((x) => x.id === id);
      if (!p || !p.nonpaymentSuspendedAt) return false;
      p.status = "waking";
      p.nonpaymentSuspendedAt = null;
      return true;
    },
  };
  return svc as unknown as PodService;
}

const DAY = 24 * 60 * 60 * 1000;

describe("DunningService.evaluateOwner (the rule)", () => {
  it("a carded account with no open invoice is never delinquent, even with low credit", async () => {
    const db = await freshDb();
    const svc = new DunningService(db, fakeBilling({ u1: { creditCents: 0, hasCard: true } }), fakePods([]));
    const r = await svc.evaluateOwner("u1", [pod("p1", "u1", "l")]); // $22 bill, $0 credit
    expect(r.delinquent).toBe(false);
    expect(r.amountDueCents).toBe(2200);
  });

  it("no card + credit below the bill → delinquent", async () => {
    const db = await freshDb();
    const svc = new DunningService(db, fakeBilling({ u1: { creditCents: 1000, hasCard: false } }), fakePods([]));
    const r = await svc.evaluateOwner("u1", [pod("p1", "u1", "l")]); // $22 bill, $10 credit
    expect(r.delinquent).toBe(true);
  });

  it("no card but credit covers the bill → not delinquent", async () => {
    const db = await freshDb();
    const svc = new DunningService(db, fakeBilling({ u1: { creditCents: 5000, hasCard: false } }), fakePods([]));
    const r = await svc.evaluateOwner("u1", [pod("p1", "u1", "l")]); // $22 bill, $50 credit
    expect(r.delinquent).toBe(false);
  });

  it("carded but a payment failed (open invoice) + credit below the bill → delinquent", async () => {
    const db = await freshDb();
    const svc = new DunningService(db, fakeBilling({ u1: { creditCents: 0, hasCard: true, openInvoice: true } }), fakePods([]));
    const r = await svc.evaluateOwner("u1", [pod("p1", "u1", "m")]);
    expect(r.delinquent).toBe(true);
  });

  it("no billable pods → never delinquent (nothing owed)", async () => {
    const db = await freshDb();
    const svc = new DunningService(db, fakeBilling({ u1: { creditCents: 0, hasCard: false } }), fakePods([]));
    const r = await svc.evaluateOwner("u1", []);
    expect(r.delinquent).toBe(false);
    expect(r.amountDueCents).toBe(0);
  });

  it("amountDueCents sums the per-size monthly price across pods", async () => {
    const db = await freshDb();
    const svc = new DunningService(db, fakeBilling({}), fakePods([]));
    // mini $4 + m $12 + xl $42 = $58
    expect(svc.amountDueCents([pod("a", "u", "mini"), pod("b", "u", "m"), pod("c", "u", "xl")])).toBe(5800);
  });
});

describe("DunningService.sweep (the clock)", () => {
  it("opens a row and emails day 1 for a newly-delinquent account", async () => {
    const db = await freshDb();
    await seedUser(db, "u1");
    const emails: DunningEmailInfo[] = [];
    const t0 = Date.UTC(2026, 0, 1);
    const svc = new DunningService(
      db,
      fakeBilling({ u1: { creditCents: 0, hasCard: false } }),
      fakePods([pod("p1", "u1", "m")]),
      { now: () => t0, sendEmail: async (i) => void emails.push(i) },
    );
    const res = await svc.sweep();
    expect(res.opened).toBe(1);
    expect(res.emailed).toBe(1);
    expect(emails[0]).toMatchObject({ ownerId: "u1", graceDay: 1, amountDueCents: 1200, suspended: false });
    const rows = await db.select().from(billingDelinquencies).where(eq(billingDelinquencies.ownerId, "u1"));
    expect(rows[0]?.lastNotifiedDay).toBe(1);
  });

  it("emails at most once per grace-day", async () => {
    const db = await freshDb();
    await seedUser(db, "u1");
    const emails: DunningEmailInfo[] = [];
    let t = Date.UTC(2026, 0, 1);
    const svc = new DunningService(
      db,
      fakeBilling({ u1: { creditCents: 0, hasCard: false } }),
      fakePods([pod("p1", "u1", "m")]),
      { now: () => t, sendEmail: async (i) => void emails.push(i) },
    );
    await svc.sweep(); // day 1
    await svc.sweep(); // same day → no new email
    expect(emails.length).toBe(1);
    t += DAY; // next day
    await svc.sweep(); // day 2
    expect(emails.length).toBe(2);
    expect(emails[1].graceDay).toBe(2);
  });

  it("suspends the account's pods only after the full grace period", async () => {
    const db = await freshDb();
    await seedUser(db, "u1");
    const pods = [pod("p1", "u1", "m"), pod("p2", "u1", "s")];
    let t = Date.UTC(2026, 0, 1);
    const svc = new DunningService(
      db,
      fakeBilling({ u1: { creditCents: 0, hasCard: false } }),
      fakePods(pods),
      { now: () => t },
    );
    await svc.sweep(); // opens at day 1
    t += DUNNING_GRACE_DAYS * DAY; // now day 8 (> 7)
    const res = await svc.sweep();
    expect(res.suspended).toBe(1);
    expect(pods.every((p) => p.status === "suspended")).toBe(true);
    const rows = await db.select().from(billingDelinquencies).where(eq(billingDelinquencies.ownerId, "u1"));
    expect(rows[0]?.suspendedAt).not.toBeNull();
  });

  it("does not suspend before the grace period elapses", async () => {
    const db = await freshDb();
    await seedUser(db, "u1");
    const pods = [pod("p1", "u1", "m")];
    let t = Date.UTC(2026, 0, 1);
    const svc = new DunningService(db, fakeBilling({ u1: { creditCents: 0, hasCard: false } }), fakePods(pods), { now: () => t });
    await svc.sweep();
    t += 3 * DAY; // day 4, still within grace
    const res = await svc.sweep();
    expect(res.suspended).toBe(0);
    expect(pods[0].status).toBe("running");
  });

  it("resolves and resumes when the account gains enough credit", async () => {
    const db = await freshDb();
    await seedUser(db, "u1");
    const pods = [pod("p1", "u1", "m")];
    let t = Date.UTC(2026, 0, 1);
    const accounts = { u1: { creditCents: 0, hasCard: false } };
    const svc = new DunningService(db, fakeBilling(accounts), fakePods(pods), { now: () => t });
    await svc.sweep();
    t += (DUNNING_GRACE_DAYS + 1) * DAY;
    await svc.sweep(); // suspends
    expect(pods[0].status).toBe("suspended");
    // Owner gets credit that now covers the bill.
    accounts.u1.creditCents = 5000;
    const res = await svc.sweep();
    expect(res.resolved).toBe(1);
    expect(pods[0].status).toBe("waking");
    expect(pods[0].nonpaymentSuspendedAt).toBeNull();
    const rows = await db.select().from(billingDelinquencies).where(eq(billingDelinquencies.ownerId, "u1"));
    expect(rows.length).toBe(0);
  });

  it("never touches a paid account's pods while a delinquent one is suspended", async () => {
    const db = await freshDb();
    await seedUser(db, "u1"); // delinquent (no card, no credit)
    await seedUser(db, "u2"); // paid (carded, no open invoice)
    const podsU1 = pod("p1", "u1", "m");
    const podsU2 = pod("p2", "u2", "l");
    let t = Date.UTC(2026, 0, 1);
    const svc = new DunningService(
      db,
      fakeBilling({ u1: { creditCents: 0, hasCard: false }, u2: { creditCents: 0, hasCard: true } }),
      fakePods([podsU1, podsU2]),
      { now: () => t },
    );
    await svc.sweep();
    t += (DUNNING_GRACE_DAYS + 1) * DAY;
    await svc.sweep();
    expect(podsU1.status).toBe("suspended");
    expect(podsU2.status).toBe("running"); // the paying account is untouched
    const u2rows = await db.select().from(billingDelinquencies).where(eq(billingDelinquencies.ownerId, "u2"));
    expect(u2rows.length).toBe(0);
  });
});
