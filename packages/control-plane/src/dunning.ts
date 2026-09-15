/**
 * Non-payment safety net — the dunning grace clock and auto-suspend.
 *
 * An account is DELINQUENT when it has no working payment (no card on file, OR a Stripe invoice
 * Stripe could not collect) AND its credit balance cannot cover the monthly cost of its running
 * pods. Credit counts from every source (signup / referral / admin grant) — it is the single
 * mirrored balance. On entering delinquency we open a `billing_delinquencies` row (the grace clock),
 * warn once a day for the grace period (dashboard banner + email), and only AFTER the full grace
 * period suspend that account's pods. Paying or gaining enough credit at any point clears the row
 * and resumes exactly the pods we suspended. Cloud-only; the gateway never runs this under OSS.
 *
 * The rule intentionally only ever suspends the delinquent account's OWN pods — a paid or
 * credit-covered account is never touched (velsa's hard constraint, 2026-09-14).
 */
import { billingDelinquencies, eq, type Database } from "@podway/db";
import { priceForSize, isPodSize } from "@podway/shared";
import { createLogger, type Logger } from "@podway/shared/log";
import type { BillingService } from "./billing.js";
import type { PodService } from "./service.js";
import type { PodRecord } from "./types.js";

/** Days of daily-warned grace before pods are suspended. Failure day = day 1. */
export const DUNNING_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A pod counts toward the monthly bill unless it is already suspended / errored / gone. */
const isBillable = (status: string): boolean =>
  status !== "suspended" && status !== "error" && status !== "gone";

export interface DunningEmailInfo {
  ownerId: string;
  /** 1-based day within the grace period (1 = the day delinquency began). */
  graceDay: number;
  amountDueCents: number;
  daysLeft: number;
  /** True on the notice sent when suspension has just happened. */
  suspended: boolean;
}

export interface DunningDeps {
  /** Wired by the gateway to the mailer; omitted → no email is sent (still logs + suspends). */
  sendEmail?: (info: DunningEmailInfo) => Promise<void>;
  /** Injectable clock for tests. */
  now?: () => number;
  logger?: Logger;
}

export interface DunningSweepResult {
  checked: number;
  opened: number;
  emailed: number;
  suspended: number;
  resolved: number;
}

export class DunningService {
  private readonly log: Logger;
  constructor(
    private readonly db: Database,
    private readonly billing: BillingService,
    private readonly pods: PodService,
    private readonly deps: DunningDeps = {},
  ) {
    this.log = deps.logger ?? createLogger("dunning");
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  /** The monthly cost, in cents, of a set of pods (flat per-size price × active pods). */
  amountDueCents(pods: Pick<PodRecord, "size">[]): number {
    return pods.reduce(
      (sum, p) => sum + (isPodSize(p.size) ? priceForSize(p.size) : 0) * 100,
      0,
    );
  }

  /**
   * The eligibility rule for one owner, given its currently-billable pods. Returns whether the
   * account is delinquent and the bill it was measured against.
   */
  async evaluateOwner(
    ownerId: string,
    billablePods: Pick<PodRecord, "size">[],
  ): Promise<{ delinquent: boolean; amountDueCents: number }> {
    const amountDueCents = this.amountDueCents(billablePods);
    // No billable pods → nothing owed → never delinquent (and any stale row gets resolved).
    if (amountDueCents <= 0) return { delinquent: false, amountDueCents: 0 };
    const acct = await this.billing.getAccount(ownerId);
    const noWorkingPayment = !acct.hasCard || (await this.billing.hasOpenInvoice(ownerId));
    const delinquent = noWorkingPayment && acct.creditCents < amountDueCents;
    return { delinquent, amountDueCents };
  }

  private async getRow(ownerId: string) {
    const rows = await this.db
      .select()
      .from(billingDelinquencies)
      .where(eq(billingDelinquencies.ownerId, ownerId));
    return rows[0] ?? null;
  }

  /**
   * Re-evaluate one owner and reconcile its delinquency row: open it when newly delinquent, clear it
   * (and resume suspended pods) when resolved. Does NOT advance the clock / email / suspend — that is
   * `sweep`'s job. Safe to call from the `invoice.payment_failed` webhook for an immediate start.
   */
  async evaluate(ownerId: string): Promise<void> {
    const billable = (await this.pods.listAllPods()).filter(
      (p) => p.ownerId === ownerId && isBillable(p.status),
    );
    const { delinquent, amountDueCents } = await this.evaluateOwner(ownerId, billable);
    const row = await this.getRow(ownerId);
    if (delinquent && !row) {
      await this.openRow(ownerId, amountDueCents);
    } else if (delinquent && row) {
      await this.db
        .update(billingDelinquencies)
        .set({ amountDueCents, updatedAt: new Date() })
        .where(eq(billingDelinquencies.ownerId, ownerId));
    } else if (!delinquent && row) {
      await this.resolve(ownerId);
    }
  }

  private async openRow(ownerId: string, amountDueCents: number): Promise<void> {
    const now = new Date(this.now());
    await this.db
      .insert(billingDelinquencies)
      .values({
        ownerId,
        since: now,
        lastNotifiedDay: 0,
        amountDueCents,
        suspendedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: billingDelinquencies.ownerId });
    this.log.info("dunning_opened", { ownerId, amountDueCents });
  }

  /** Clear delinquency: resume any pod we suspended for non-payment, then delete the row. */
  private async resolve(ownerId: string): Promise<void> {
    const suspended = (await this.pods.listAllPods()).filter(
      (p) => p.ownerId === ownerId && p.nonpaymentSuspendedAt,
    );
    for (const p of suspended) {
      await this.pods.resumeFromNonpayment(p.id).catch((e) => {
        this.log.warn("dunning_resume_failed", { pod: p.id, error: String(e) });
      });
    }
    await this.db.delete(billingDelinquencies).where(eq(billingDelinquencies.ownerId, ownerId));
    this.log.info("dunning_resolved", { ownerId, resumed: suspended.length });
  }

  /**
   * The daily sweep. Detects newly-delinquent accounts, advances each open grace clock (one email
   * per day), and suspends an account's pods once the grace period has fully elapsed. Idempotent:
   * safe to run repeatedly; emails at most once per grace-day; suspends at most once.
   */
  async sweep(): Promise<DunningSweepResult> {
    const result: DunningSweepResult = { checked: 0, opened: 0, emailed: 0, suspended: 0, resolved: 0 };
    const all = await this.pods.listAllPods();
    const billableByOwner = new Map<string, PodRecord[]>();
    for (const p of all) {
      if (!isBillable(p.status)) continue;
      const list = billableByOwner.get(p.ownerId) ?? [];
      list.push(p);
      billableByOwner.set(p.ownerId, list);
    }
    // Owners to check = those running billable pods ∪ those with an existing row (so a row whose
    // pods all went away still resolves).
    const rows = await this.db.select().from(billingDelinquencies);
    const owners = new Set<string>([...billableByOwner.keys(), ...rows.map((r) => r.ownerId)]);
    const rowByOwner = new Map(rows.map((r) => [r.ownerId, r]));

    for (const ownerId of owners) {
      result.checked++;
      const billable = billableByOwner.get(ownerId) ?? [];
      const delta = await this.advanceOwner(ownerId, billable, rowByOwner.get(ownerId) ?? null);
      result.opened += delta.opened;
      result.emailed += delta.emailed;
      result.suspended += delta.suspended;
      result.resolved += delta.resolved;
    }
    return result;
  }

  /**
   * Advance ONE owner's dunning state: open a row if newly delinquent, email today's reminder,
   * suspend once grace elapses, or resolve (and resume) if no longer delinquent. Owner-scoped so it
   * can be driven for a single account (e.g. an e2e) without touching anyone else's pods. Uses the
   * injected clock, so a test can move `now` forward to cross the grace boundary.
   */
  async advance(ownerId: string): Promise<{ opened: number; emailed: number; suspended: number; resolved: number }> {
    const billable = (await this.pods.listAllPods()).filter(
      (p) => p.ownerId === ownerId && isBillable(p.status),
    );
    return this.advanceOwner(ownerId, billable, await this.getRow(ownerId));
  }

  private async advanceOwner(
    ownerId: string,
    billable: PodRecord[],
    existingRow: Awaited<ReturnType<DunningService["getRow"]>> | null,
  ): Promise<{ opened: number; emailed: number; suspended: number; resolved: number }> {
    const delta = { opened: 0, emailed: 0, suspended: 0, resolved: 0 };
    const { delinquent, amountDueCents } = await this.evaluateOwner(ownerId, billable);
    let row = existingRow;

    if (!delinquent) {
      if (row) {
        await this.resolve(ownerId);
        delta.resolved++;
      }
      return delta;
    }

    // Delinquent: ensure a row exists, then advance the clock.
    if (!row) {
      await this.openRow(ownerId, amountDueCents);
      delta.opened++;
      row = await this.getRow(ownerId);
      if (!row) return delta;
    }

    const graceDay = Math.floor((this.now() - row.since.getTime()) / DAY_MS) + 1;

    if (graceDay > DUNNING_GRACE_DAYS) {
      // Grace elapsed → suspend the account's pods (once).
      if (!row.suspendedAt) {
        let suspendedCount = 0;
        for (const p of billable) {
          if (await this.pods.suspendForNonpayment(p.id).catch(() => false)) suspendedCount++;
        }
        await this.db
          .update(billingDelinquencies)
          .set({ suspendedAt: new Date(this.now()), amountDueCents, updatedAt: new Date() })
          .where(eq(billingDelinquencies.ownerId, ownerId));
        delta.suspended++;
        await this.email({ ownerId, graceDay, amountDueCents, daysLeft: 0, suspended: true });
        this.log.info("dunning_suspended", { ownerId, pods: suspendedCount });
      }
      return delta;
    }

    // Within grace → send today's reminder if we haven't already.
    if (graceDay > row.lastNotifiedDay) {
      await this.email({
        ownerId,
        graceDay,
        amountDueCents,
        daysLeft: DUNNING_GRACE_DAYS - graceDay,
        suspended: false,
      });
      await this.db
        .update(billingDelinquencies)
        .set({ lastNotifiedDay: graceDay, amountDueCents, updatedAt: new Date() })
        .where(eq(billingDelinquencies.ownerId, ownerId));
      delta.emailed++;
    }
    return delta;
  }

  private async email(info: DunningEmailInfo): Promise<void> {
    if (!this.deps.sendEmail) return;
    await this.deps.sendEmail(info).catch((e) => {
      this.log.warn("dunning_email_failed", { ownerId: info.ownerId, error: String(e) });
    });
  }
}
