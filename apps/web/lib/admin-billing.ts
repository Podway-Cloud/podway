import "server-only";

import { eq, createAppDb, user as userTable, pods as podsTable, billingAccounts } from "@podway/db";
import { ramGbForSize, isPodSize, ACCOUNT_RAM_GB, CARDED_RAM_GB, type PodSize } from "@podway/shared";
import { getBillingService, getPodService } from "./pod-service";
import { stripeConfigured, stripeLiveMode } from "@podway/control-plane";

/** A pod status contributes to the RAM tally only while it's actually holding memory. */
const ACTIVE = (status: string) => status !== "suspended" && status !== "error" && status !== "gone";

/** The RAM budget a given user gets: higher once a card is on file (mirrors lib/account-limits). */
function capFor(hasCard: boolean): number {
  return hasCard ? CARDED_RAM_GB : ACCOUNT_RAM_GB;
}

export interface BillingRow {
  id: string;
  email: string;
  name: string;
  creditCents: number;
  hasCard: boolean;
  stripeCustomerId: string | null;
  /** Pods currently holding RAM (running/launching), not suspended/error/gone. */
  activePods: number;
  /** Every pod the user owns, any status. */
  totalPods: number;
  /** RAM held by active pods (GB). */
  usedGb: number;
  /** The user's RAM budget (GB) — 16 free, 64 with a card. */
  capGb: number;
  /** True when active RAM meets or exceeds the budget — the account is at its ceiling. */
  overBudget: boolean;
}

/**
 * The billing overview table for /admin/billing. Assembled from three bulk DB reads (users,
 * billing_accounts, pods) — NO per-user Stripe calls, so it stays fast at alpha scale. Credit +
 * card status come from the local mirror (billing_accounts); the per-user detail page does the
 * live Stripe reads. Sorted by credit desc, then most pods, so the accounts that matter sit on top.
 */
export async function listBillingOverview(): Promise<BillingRow[]> {
  const db = createAppDb();
  const [users, accounts, pods] = await Promise.all([
    db.select().from(userTable),
    db.select().from(billingAccounts),
    db.select({ ownerId: podsTable.ownerId, size: podsTable.size, status: podsTable.status }).from(podsTable),
  ]);

  const acctByOwner = new Map(accounts.map((a) => [a.ownerId, a]));
  const podsByOwner = new Map<string, { size: string; status: string }[]>();
  for (const p of pods) {
    const list = podsByOwner.get(p.ownerId) ?? [];
    list.push({ size: p.size, status: p.status });
    podsByOwner.set(p.ownerId, list);
  }

  return users
    .map((u) => {
      const acct = acctByOwner.get(u.id);
      const owned = podsByOwner.get(u.id) ?? [];
      const active = owned.filter((p) => ACTIVE(p.status));
      const usedGb = active.reduce((n, p) => n + (isPodSize(p.size) ? ramGbForSize(p.size) : 0), 0);
      const hasCard = acct?.hasCard ?? false;
      const capGb = capFor(hasCard);
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        creditCents: acct?.creditCents ?? 0,
        hasCard,
        stripeCustomerId: acct?.stripeCustomerId ?? null,
        activePods: active.length,
        totalPods: owned.length,
        usedGb,
        capGb,
        overBudget: usedGb >= capGb,
      };
    })
    .sort((a, b) => b.creditCents - a.creditCents || b.totalPods - a.totalPods || a.email.localeCompare(b.email));
}

export interface PodLine {
  id: string;
  name: string;
  size: PodSize;
  status: string;
  ramGb: number;
}

export interface UserBilling {
  id: string;
  email: string;
  name: string;
  creditCents: number;
  hasCard: boolean;
  stripeCustomerId: string | null;
  card: { brand: string; last4: string; expMonth: number; expYear: number } | null;
  pods: PodLine[];
  usedGb: number;
  capGb: number;
  invoices: {
    id: string;
    number: string | null;
    amountCents: number;
    amountPaidCents: number;
    status: string | null;
    created: number;
    url: string | null;
  }[];
  /** Sum of every invoice actually paid (cents) — the account's lifetime spend. */
  lifetimeSpendCents: number;
  grants: { id: string; cents: number; reason: string; created: number }[];
  referral: { joined: number; pending: number; earned: number; earnedCents: number };
  nextChargeAt: number | null;
  /** A Stripe dashboard deep link for this customer, mode-aware, or null with no customer id. */
  stripeUrl: string | null;
}

/** The Stripe dashboard customer URL for the current mode (test vs live), or null. */
export function stripeCustomerUrl(customerId: string | null): string | null {
  if (!customerId) return null;
  const seg = stripeLiveMode() ? "" : "test/";
  return `https://dashboard.stripe.com/${seg}customers/${customerId}`;
}

/**
 * Everything the per-user billing drill-in shows. Unlike the overview this DOES hit Stripe
 * (invoices, card, referral, next charge) — fine for a single user. Every Stripe-backed call
 * already returns empty/null when billing is off, so this is safe to call unconditionally.
 */
export async function getUserBilling(id: string): Promise<UserBilling | null> {
  const rows = await createAppDb().select().from(userTable).where(eq(userTable.id, id));
  const u = rows[0];
  if (!u) return null;

  const billing = getBillingService();
  const [account, card, invoices, grants, referral, nextChargeAt, podRecords] = await Promise.all([
    billing.getAccount(id),
    billing.getPaymentMethod(id).catch(() => null),
    billing.listInvoices(id).catch(() => []),
    billing.listCreditGrants(id).catch(() => []),
    billing.getReferralStatus(id).catch(() => ({ joined: 0, pending: 0, earned: 0, earnedCents: 0 })),
    billing.getNextChargeDate(id).catch(() => null),
    getPodService().listPods(id).catch(() => []),
  ]);

  const pods: PodLine[] = podRecords.map((p) => ({
    id: p.id,
    name: p.name ?? p.id,
    size: p.size,
    status: p.status,
    ramGb: ramGbForSize(p.size),
  }));
  const usedGb = pods.filter((p) => ACTIVE(p.status)).reduce((n, p) => n + p.ramGb, 0);
  const lifetimeSpendCents = invoices.reduce((n, inv) => n + (inv.amountPaidCents ?? 0), 0);

  return {
    id,
    email: u.email,
    name: u.name,
    creditCents: account.creditCents,
    hasCard: account.hasCard,
    stripeCustomerId: account.stripeCustomerId,
    card,
    pods,
    usedGb,
    capGb: capFor(account.hasCard),
    invoices,
    lifetimeSpendCents,
    grants,
    referral,
    nextChargeAt,
    stripeUrl: stripeCustomerUrl(account.stripeCustomerId),
  };
}

/** Whether the admin credit-grant action is usable (Stripe wired). */
export function creditGrantEnabled(): boolean {
  return stripeConfigured();
}
