/**
 * Billing — Stripe integration (Phase 2, size-based-pod-pricing). Slice 2a: the per-owner Stripe
 * customer + card-on-file (SetupIntent). Subscriptions (2b), credit/referral (2c), and webhooks (2d)
 * build on this. Cloud only; every entry point no-ops when Stripe isn't configured.
 *
 * The Stripe SECRET key never leaves the server. The PUBLISHABLE key (STRIPE_PUB_KEY) is safe for the
 * browser and is handed to the client by a server component, so the card form can talk to Stripe
 * directly (the card number never touches our servers).
 */
import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { billingAccounts, creditGrants, user, eq, and, desc, sql, type Database } from "@podway/db";
import { POD_TIERS, SUSPENDED_USD, SIGNUP_CREDIT_CENTS, type PodSize } from "@podway/shared";

/**
 * The signup credit granted once a card is on file (cents). Advertised as ~$15. The value now lives
 * in `@podway/shared` so the customer-facing `SIGNUP_CREDIT_USD` (web pricing catalog) derives from
 * the SAME number — re-exported here so existing `@podway/control-plane` consumers are unchanged.
 */
export { SIGNUP_CREDIT_CENTS };

/** Referral credit each side gets ($10). Referred: on card-add. Referrer: on the referred account's
 * first real payment, once that account is ~30 days old. */
export const REFERRAL_CENTS = 1000;
const REFERRAL_MATURITY_MS = 30 * 24 * 60 * 60 * 1000;

let _stripe: Stripe | null = null;

/**
 * Live mode is EXPLICIT and off by default: the LIVE keys are used ONLY when `STRIPE_LIVE_MODE=1`
 * (set on prod). Otherwise the TEST keys are used. This guarantees a dev/test box NEVER charges real
 * cards by accident, even if the live keys are present in its environment.
 */
export function stripeLiveMode(): boolean {
  return process.env.STRIPE_LIVE_MODE === "1";
}

/** The active secret key (server-only): live in live mode, else test. */
function stripeSecretKey(): string | undefined {
  return stripeLiveMode() ? process.env.STRIPE_LIVE_SECRET_KEY : process.env.STRIPE_SECRET_KEY;
}

/** The active PUBLISHABLE key (safe for the browser): live in live mode, else test. */
export function stripePublishableKey(): string | undefined {
  return stripeLiveMode() ? process.env.STRIPE_LIVE_PUB_KEY : process.env.STRIPE_PUB_KEY;
}

/** True when a Stripe secret key is present for the active mode — gate every billing surface on this. */
export function stripeConfigured(): boolean {
  return Boolean(stripeSecretKey());
}

/** The shared Stripe client (lazy). Throws if unconfigured — callers gate on `stripeConfigured()`. */
export function getStripe(): Stripe {
  const key = stripeSecretKey();
  if (!key) throw new Error("Stripe secret key is not set for the active mode");
  if (!_stripe) _stripe = new Stripe(key);
  return _stripe;
}

export interface BillingAccount {
  ownerId: string;
  stripeCustomerId: string | null;
  creditCents: number;
  hasCard: boolean;
}

const EMPTY = (ownerId: string): BillingAccount => ({
  ownerId,
  stripeCustomerId: null,
  creditCents: 0,
  hasCard: false,
});

export class BillingService {
  /**
   * `stripeClient` is an OPTIONAL injected Stripe client — production leaves it undefined and uses
   * the shared lazy `getStripe()` (unchanged behavior). Tests inject a fake so the Stripe-facing
   * methods can be exercised without real keys or network. Never used to reach LIVE Stripe.
   */
  constructor(
    private readonly db: Database,
    private readonly stripeClient?: Stripe,
  ) {}

  /** The Stripe client for this instance: the injected one (tests) or the shared lazy singleton. */
  private stripe(): Stripe {
    return this.stripeClient ?? getStripe();
  }

  /** The owner's billing row, or an empty default (never null) — the UI reads it directly. */
  async getAccount(ownerId: string): Promise<BillingAccount> {
    const rows = await this.db.select().from(billingAccounts).where(eq(billingAccounts.ownerId, ownerId));
    const r = rows[0];
    if (!r) return EMPTY(ownerId);
    return {
      ownerId: r.ownerId,
      stripeCustomerId: r.stripeCustomerId ?? null,
      creditCents: r.creditCents,
      hasCard: r.hasCard,
    };
  }

  /**
   * The owner's Stripe customer id, creating the customer (and the billing row) on first need.
   * Idempotent: a second call returns the same id. `email` seeds the Stripe customer for receipts.
   */
  async ensureCustomer(ownerId: string, email?: string): Promise<string> {
    const existing = await this.getAccount(ownerId);
    if (existing.stripeCustomerId) return existing.stripeCustomerId;

    const customer = await this.stripe().customers.create({
      email: email ?? (await this.emailFor(ownerId)),
      metadata: { ownerId },
    });
    const now = new Date();
    await this.db
      .insert(billingAccounts)
      .values({ ownerId, stripeCustomerId: customer.id, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: billingAccounts.ownerId,
        set: { stripeCustomerId: customer.id, updatedAt: now },
      });
    return customer.id;
  }

  /**
   * A SetupIntent so the browser's Stripe Elements can save a card WITHOUT the number touching our
   * servers. Returns the client secret (for Elements) and the customer id. Ensures the customer first.
   */
  private async emailFor(ownerId: string): Promise<string | undefined> {
    const rows = await this.db.select({ email: user.email }).from(user).where(eq(user.id, ownerId));
    return rows[0]?.email;
  }

  async createSetupIntent(ownerId: string, email?: string): Promise<{ clientSecret: string; customerId: string }> {
    const customerId = await this.ensureCustomer(ownerId, email);
    const intent = await this.stripe().setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session", // we charge the saved card later, unattended (monthly)
    });
    if (!intent.client_secret) throw new Error("Stripe returned no client secret for the SetupIntent");
    return { clientSecret: intent.client_secret, customerId };
  }

  /**
   * Mark whether the owner has a usable default card, mirrored from Stripe for quick UI reads. Called
   * after a card is saved (2a) and, later, from the webhook that confirms it (2d).
   */
  async setHasCard(ownerId: string, hasCard: boolean): Promise<void> {
    const now = new Date();
    await this.db
      .insert(billingAccounts)
      .values({ ownerId, hasCard, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: billingAccounts.ownerId, set: { hasCard, updatedAt: now } });
  }

  // ---- 2c: credit ledger ------------------------------------------------------------------------

  /**
   * Grant credit ONCE per (owner, reason): record it in our ledger, bump the mirror balance, and push
   * it to Stripe's customer balance (negative = credit, auto-applied to the owner's invoices). The
   * unique (owner, reason) index makes this idempotent — a repeat call is a no-op. Returns whether a
   * NEW grant happened. Requires a Stripe customer (created here if missing).
   */
  async grantCredit(ownerId: string, cents: number, reason: string): Promise<boolean> {
    if (!stripeConfigured() || cents <= 0) return false;
    // Claim the grant first; the unique index rejects a duplicate reason → already granted.
    const inserted = await this.db
      .insert(creditGrants)
      .values({ id: randomUUID(), ownerId, cents, reason })
      .onConflictDoNothing()
      .returning({ id: creditGrants.id });
    if (inserted.length === 0) return false; // already granted for this reason

    const customerId = await this.ensureCustomer(ownerId);
    await this.stripe().customers.createBalanceTransaction(customerId, {
      amount: -cents, // negative = credit toward future invoices
      currency: "usd",
      description: `Podway credit: ${reason}`,
    });
    await this.db
      .update(billingAccounts)
      .set({ creditCents: sql`${billingAccounts.creditCents} + ${cents}`, updatedAt: new Date() })
      .where(eq(billingAccounts.ownerId, ownerId));
    return true;
  }

  /** The one-time signup credit — granted when the owner first puts a card on file. */
  async grantSignupCredit(ownerId: string): Promise<boolean> {
    return this.grantCredit(ownerId, SIGNUP_CREDIT_CENTS, "signup");
  }

  // ---- referral --------------------------------------------------------------------------------
  // A referral link is `…/start?ref=<referrerUserId>`; the existing first-touch `user.ref` captures it
  // at signup. So the referrer is derived: this account's `ref`, when it names a DIFFERENT real user.

  private async userMeta(ownerId: string): Promise<{ ref: string | null; createdAt: Date } | null> {
    const rows = await this.db
      .select({ ref: user.ref, createdAt: user.createdAt })
      .from(user)
      .where(eq(user.id, ownerId));
    return rows[0] ?? null;
  }

  /** The account that referred `ownerId`, if their `?ref` names a different real user — else null. */
  async referrerOf(ownerId: string): Promise<string | null> {
    const me = await this.userMeta(ownerId);
    const ref = me?.ref?.trim();
    if (!ref || ref === ownerId) return null;
    const rows = await this.db.select({ id: user.id }).from(user).where(eq(user.id, ref));
    return rows[0]?.id ?? null;
  }

  /** On card-add: if this account was referred, grant the REFERRED side its $10 (idempotent). The
   * referrer's $10 waits for the referred account's first real payment at maturity (see handleEvent). */
  async grantReferralReferred(ownerId: string): Promise<boolean> {
    const referrer = await this.referrerOf(ownerId);
    if (!referrer) return false;
    return this.grantCredit(ownerId, REFERRAL_CENTS, "referral_referred");
  }

  /** Pay the referrer $10 once the referred account has actually paid AND is ~30 days old. Idempotent
   * per (referrer, referred). Called from the invoice.paid webhook. */
  private async maybePayReferrer(referredOwnerId: string): Promise<void> {
    const referrer = await this.referrerOf(referredOwnerId);
    if (!referrer) return;
    const me = await this.userMeta(referredOwnerId);
    if (!me) return;
    if (Date.now() - me.createdAt.getTime() < REFERRAL_MATURITY_MS) return; // not mature yet
    await this.grantCredit(referrer, REFERRAL_CENTS, `referral_referrer:${referredOwnerId}`);
  }

  // ---- 2d: webhooks + invoices ------------------------------------------------------------------

  /** Which owner a Stripe customer belongs to (via our billing row), or null. */
  private async ownerByCustomer(customerId: string): Promise<string | null> {
    const rows = await this.db
      .select({ ownerId: billingAccounts.ownerId })
      .from(billingAccounts)
      .where(eq(billingAccounts.stripeCustomerId, customerId));
    return rows[0]?.ownerId ?? null;
  }

  /** Verify a raw webhook body against its `stripe-signature` header. Throws on a bad/forged signature.
   * `secret` is the endpoint's signing secret (STRIPE_WEBHOOK_SECRET; passed so tests can inject one). */
  verifyEvent(rawBody: string | Buffer, signature: string, secret = process.env.STRIPE_WEBHOOK_SECRET): Stripe.Event {
    if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
    return this.stripe().webhooks.constructEvent(rawBody, signature, secret);
  }

  /**
   * Apply a VERIFIED Stripe event to our state. Idempotent + tolerant of unknown types (Stripe sends
   * many). Today it makes card-on-file authoritative (backing 2a's optimistic flag) and clears it if a
   * card detaches. Subscription/invoice events are acknowledged; the referral payout will hook
   * `invoice.paid` here in the referral slice.
   */
  async handleEvent(event: Stripe.Event): Promise<{ handled: string }> {
    const customerIdOf = (obj: unknown): string | null => {
      const c = (obj as { customer?: unknown }).customer;
      return typeof c === "string" ? c : null;
    };
    switch (event.type) {
      case "payment_method.attached":
      case "setup_intent.succeeded": {
        const cust = customerIdOf(event.data.object);
        const owner = cust ? await this.ownerByCustomer(cust) : null;
        if (owner) await this.setHasCard(owner, true);
        return { handled: event.type };
      }
      case "payment_method.detached": {
        // The object here carries no customer; best-effort — a later attach re-sets it. No-op for now.
        return { handled: "payment_method.detached (noop)" };
      }
      case "invoice.paid": {
        // A referred account actually paid → pay their referrer $10 once mature (~30 days). Idempotent.
        const cust = customerIdOf(event.data.object);
        const amountPaid = (event.data.object as { amount_paid?: number }).amount_paid ?? 0;
        const owner = cust ? await this.ownerByCustomer(cust) : null;
        if (owner && amountPaid > 0) await this.maybePayReferrer(owner);
        return { handled: "invoice.paid" };
      }
      default:
        return { handled: `ignored:${event.type}` };
    }
  }

  /** The owner's recent invoices for the billing page. Empty when there's no Stripe customer yet.
   * Exposes BOTH `amountDueCents` and `amountPaidCents` — the UI shows what was actually PAID (the
   * amount after any credit was applied), not the pre-credit amount due. */
  async listInvoices(
    ownerId: string,
    limit = 12,
  ): Promise<
    {
      id: string;
      number: string | null;
      amountCents: number;
      amountDueCents: number;
      amountPaidCents: number;
      status: string;
      created: number;
      url: string | null;
    }[]
  > {
    if (!stripeConfigured()) return [];
    const acct = await this.getAccount(ownerId);
    if (!acct.stripeCustomerId) return [];
    const list = await this.stripe().invoices.list({ customer: acct.stripeCustomerId, limit });
    return list.data.map((inv) => ({
      id: inv.id ?? "",
      number: inv.number ?? null,
      // `amountCents` kept for back-compat (== amount_due); prefer amountPaidCents for display.
      amountCents: inv.amount_due,
      amountDueCents: inv.amount_due,
      amountPaidCents: inv.amount_paid,
      status: inv.status ?? "unknown",
      created: inv.created,
      url: inv.hosted_invoice_url ?? null,
    }));
  }

  // ---- billing page reads (card, credit history, referral status, next charge) -----------------

  /** The card brand/last4/expiry for the owner's DEFAULT payment method, or null when there's no
   * Stripe customer or no card on file. Reads Stripe (never creates a customer). Guarded — a Stripe
   * hiccup returns null (the UI shows the "no card" state) rather than throwing. */
  async getPaymentMethod(
    ownerId: string,
  ): Promise<{ brand: string; last4: string; expMonth: number; expYear: number } | null> {
    if (!stripeConfigured()) return null;
    const acct = await this.getAccount(ownerId);
    if (!acct.stripeCustomerId) return null;
    try {
      const stripe = this.stripe();
      // Prefer the customer's invoice-settings default PM; fall back to the first saved card.
      const customer = await stripe.customers.retrieve(acct.stripeCustomerId);
      let pmId: string | null = null;
      if (customer && !("deleted" in customer && customer.deleted)) {
        const dflt = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
        pmId = typeof dflt === "string" ? dflt : (dflt?.id ?? null);
      }
      if (!pmId) {
        const list = await stripe.paymentMethods.list({ customer: acct.stripeCustomerId, type: "card", limit: 1 });
        pmId = list.data[0]?.id ?? null;
      }
      if (!pmId) return null;
      const pm = await stripe.paymentMethods.retrieve(pmId);
      const card = pm.card;
      if (!card) return null;
      return { brand: card.brand, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year };
    } catch {
      return null;
    }
  }

  /** Detach the owner's default payment method (all saved cards) and clear the has-card mirror. No-op
   * when Stripe is off or there's no customer. Idempotent — detaching an already-gone card is fine. */
  async detachPaymentMethod(ownerId: string): Promise<void> {
    if (!stripeConfigured()) return;
    const acct = await this.getAccount(ownerId);
    if (!acct.stripeCustomerId) return;
    const stripe = this.stripe();
    const list = await stripe.paymentMethods.list({ customer: acct.stripeCustomerId, type: "card", limit: 100 });
    for (const pm of list.data) {
      await stripe.paymentMethods.detach(pm.id).catch(() => undefined);
    }
    await this.setHasCard(ownerId, false);
  }

  /** The owner's credit-grant history (signup + referral), newest first — read straight from our
   * ledger table (no Stripe call). Always safe to call. */
  async listCreditGrants(
    ownerId: string,
  ): Promise<{ id: string; cents: number; reason: string; created: number }[]> {
    const rows = await this.db
      .select({ id: creditGrants.id, cents: creditGrants.cents, reason: creditGrants.reason, createdAt: creditGrants.createdAt })
      .from(creditGrants)
      .where(eq(creditGrants.ownerId, ownerId))
      .orderBy(desc(creditGrants.createdAt));
    return rows.map((r) => ({ id: r.id, cents: r.cents, reason: r.reason, created: Math.floor(r.createdAt.getTime() / 1000) }));
  }

  /** Referral status for the owner's Referral tab: how many accounts they've referred (`joined`),
   * how many referrer payouts have matured/paid (`earned`, with the summed cents), and the rest still
   * pending (`pending`). Pure DB reads — the referred count comes from `user.ref`, the earned payouts
   * from our own `credit_grants` ledger (reason `referral_referrer:<id>`). */
  async getReferralStatus(
    ownerId: string,
  ): Promise<{ joined: number; pending: number; earned: number; earnedCents: number }> {
    // Accounts this owner referred: their `user.ref` names this owner (excluding a self-ref).
    const referred = await this.db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.ref, ownerId), sql`${user.id} <> ${ownerId}`));
    const joined = referred.length;
    // Matured referrer payouts we actually received (idempotent per referred account).
    const grants = await this.db
      .select({ cents: creditGrants.cents, reason: creditGrants.reason })
      .from(creditGrants)
      .where(eq(creditGrants.ownerId, ownerId));
    const payouts = grants.filter((g) => g.reason.startsWith("referral_referrer:"));
    const earned = payouts.length;
    const earnedCents = payouts.reduce((s, g) => s + g.cents, 0);
    const pending = Math.max(0, joined - earned);
    return { joined, pending, earned, earnedCents };
  }

  /** When the owner's next charge lands (unix seconds), read from their live Stripe subscription's
   * current period end — or null when there's no customer/subscription or Stripe is off. Best-effort
   * and defensive about where Stripe keeps `current_period_end` across API versions (subscription
   * top-level vs. subscription item); returns null rather than throwing. */
  async getNextChargeDate(ownerId: string): Promise<number | null> {
    if (!stripeConfigured()) return null;
    const acct = await this.getAccount(ownerId);
    if (!acct.stripeCustomerId) return null;
    try {
      const subs = await this.stripe().subscriptions.list({ customer: acct.stripeCustomerId, status: "all", limit: 1 });
      const sub = subs.data.find((s) => s.status !== "canceled" && s.status !== "incomplete_expired");
      if (!sub) return null;
      const topLevel = (sub as unknown as { current_period_end?: number }).current_period_end;
      if (typeof topLevel === "number") return topLevel;
      const itemEnd = (sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end;
      return typeof itemEnd === "number" ? itemEnd : null;
    } catch {
      return null;
    }
  }

  // ---- 2b: subscriptions (reconcile pod lifecycle → Stripe) --------------------------------------

  /**
   * Reconcile the owner's Stripe subscription to their CURRENT pods (idempotent). Each billable pod is
   * one subscription item at its price (running → size price, suspended → the flat $1 price), tagged
   * with the podId in metadata so we can diff Stripe items ↔ pods with no extra DB columns. Called
   * best-effort after any lifecycle change; a missed call self-heals on the next. Skips entirely when
   * Stripe is off or the owner has no card (can't charge) — so nothing is billed prematurely.
   */
  async syncSubscription(
    ownerId: string,
    pods: { podId: string; size: PodSize; status: string }[],
  ): Promise<{ skipped?: string; subscriptionId?: string; items?: number }> {
    if (!stripeConfigured()) return { skipped: "stripe-off" };
    const acct = await this.getAccount(ownerId);
    if (!acct.hasCard) return { skipped: "no-card" }; // never create a charge before a card is on file

    const stripe = this.stripe();
    const customerId = await this.ensureCustomer(ownerId);
    const prices = await this.ensurePrices();

    // Desired: podId → priceId. error/gone/destroyed pods are not billable.
    const billable = (s: string) => s !== "error" && s !== "gone" && s !== "destroyed" && s !== "destroying";
    const desired = new Map<string, string>();
    for (const p of pods) {
      if (!billable(p.status)) continue;
      const key = p.status === "suspended" ? "suspended" : p.size;
      desired.set(p.podId, prices.get(key)!);
    }

    // Current subscription for this customer (we keep at most one).
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1 });
    let sub = subs.data.find((s) => s.status !== "canceled" && s.status !== "incomplete_expired");

    if (desired.size === 0) {
      if (sub) await stripe.subscriptions.cancel(sub.id);
      return { subscriptionId: sub?.id, items: 0 };
    }

    if (!sub) {
      const created = await stripe.subscriptions.create({
        customer: customerId,
        items: [...desired].map(([podId, price]) => ({ price, quantity: 1, metadata: { podId } })),
        payment_behavior: "allow_incomplete",
        proration_behavior: "create_prorations",
      });
      return { subscriptionId: created.id, items: desired.size };
    }

    // Diff existing items (keyed by metadata.podId) against desired.
    const byPod = new Map<string, Stripe.SubscriptionItem>();
    for (const it of sub.items.data) {
      const pid = it.metadata?.podId;
      if (pid) byPod.set(pid, it);
    }
    for (const [podId, price] of desired) {
      const existing = byPod.get(podId);
      if (!existing) {
        await stripe.subscriptionItems.create({ subscription: sub.id, price, quantity: 1, metadata: { podId } });
      } else if (existing.price.id !== price) {
        await stripe.subscriptionItems.update(existing.id, { price, proration_behavior: "create_prorations" });
      }
    }
    for (const [podId, it] of byPod) {
      if (!desired.has(podId)) {
        // Removing the last item would error — cancel the whole subscription instead.
        if (sub.items.data.length === 1) await stripe.subscriptions.cancel(sub.id);
        else await stripe.subscriptionItems.del(it.id, { proration_behavior: "create_prorations" });
      }
    }
    return { subscriptionId: sub.id, items: desired.size };
  }

  /** Stable lookup key for a size's monthly price. */
  private priceKey(size: PodSize | "suspended"): string {
    return `podway_${size}_monthly_v1`;
  }

  private _prices: Map<string, string> | null = null;

  /**
   * Ensure a recurring monthly Stripe Price exists for every size + the suspended rate, keyed by a
   * stable lookup_key so this is idempotent (fetch-or-create). Amounts come from POD_TIERS. Cached
   * per process. Returns key ("mini"|"s"|…|"suspended") → priceId.
   */
  async ensurePrices(): Promise<Map<string, string>> {
    if (this._prices) return this._prices;
    const stripe = this.stripe();
    const wanted: { key: string; lookup: string; label: string; cents: number }[] = [];
    for (const size of Object.keys(POD_TIERS) as PodSize[]) {
      wanted.push({
        key: size,
        lookup: this.priceKey(size),
        label: `Podway pod — ${POD_TIERS[size].label}`,
        cents: POD_TIERS[size].monthlyUsd * 100,
      });
    }
    wanted.push({ key: "suspended", lookup: this.priceKey("suspended"), label: "Podway pod — suspended", cents: SUSPENDED_USD * 100 });

    const out = new Map<string, string>();
    const existing = await stripe.prices.list({ lookup_keys: wanted.map((w) => w.lookup), limit: 100 });
    const byLookup = new Map(existing.data.map((p) => [p.lookup_key ?? "", p.id]));
    for (const w of wanted) {
      const have = byLookup.get(w.lookup);
      if (have) {
        out.set(w.key, have);
        continue;
      }
      const price = await stripe.prices.create({
        currency: "usd",
        unit_amount: w.cents,
        recurring: { interval: "month" },
        lookup_key: w.lookup,
        product_data: { name: w.label },
      });
      out.set(w.key, price.id);
    }
    this._prices = out;
    return out;
  }
}
