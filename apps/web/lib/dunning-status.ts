import "server-only";
import { createAppDb, billingDelinquencies, eq } from "@podway/db";
import { DUNNING_GRACE_DAYS } from "@podway/control-plane";
import { editionOss } from "@/lib/session";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DelinquencyStatus {
  /** 1-based day within the grace period. */
  graceDay: number;
  /** Days remaining before suspension (0 once elapsed). */
  daysLeft: number;
  /** Whether the account's pods have already been suspended for non-payment. */
  suspended: boolean;
  amountDueCents: number;
}

/**
 * The current non-payment state for an owner, or null when the account is in good standing (or when
 * billing is off / self-host — the banner never shows there). Read-only mirror of the dunning row the
 * gateway sweep maintains; used to render the dashboard warning banner.
 */
export async function getDelinquency(ownerId: string): Promise<DelinquencyStatus | null> {
  // Self-host has no billing. Otherwise a row exists only because the (Stripe-gated) sweep created
  // it, so its presence — not a live Stripe check — is what the banner keys off.
  if (editionOss()) return null;
  try {
    const rows = await createAppDb()
      .select()
      .from(billingDelinquencies)
      .where(eq(billingDelinquencies.ownerId, ownerId));
    const row = rows[0];
    if (!row) return null;
    const graceDay = Math.floor((Date.now() - row.since.getTime()) / DAY_MS) + 1;
    return {
      graceDay,
      daysLeft: Math.max(0, DUNNING_GRACE_DAYS - graceDay),
      suspended: row.suspendedAt !== null,
      amountDueCents: row.amountDueCents,
    };
  } catch {
    // A billing read must never break the dashboard — no banner beats a 500.
    return null;
  }
}
