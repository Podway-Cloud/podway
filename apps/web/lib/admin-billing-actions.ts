"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "./access";
import { getBillingService } from "./pod-service";
import { stripeConfigured } from "@podway/control-plane";

/**
 * Admin: grant credit to a user's account. Pushes a Stripe customer-balance credit (auto-applied
 * to future invoices) and records it in the credit_grants ledger. The reason carries a unique
 * suffix (`admin:<uuid>`) so the one-time-per-reason index never blocks a repeat manual grant —
 * unlike the signup/referral grants which are deliberately once-only.
 *
 * Gated on requireAdmin (a Server Action is a directly-invocable POST, so page gating is not
 * enough — audit H2). No-ops safely when Stripe is unconfigured.
 */
export async function grantCreditAdmin(
  ownerId: string,
  cents: number,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!stripeConfigured()) return { ok: false, error: "Billing is not configured." };
  if (!ownerId) return { ok: false, error: "Missing user." };
  if (!Number.isInteger(cents) || cents <= 0) return { ok: false, error: "Enter a positive amount." };
  if (cents > 1_000_00) return { ok: false, error: "Amount too large (max $1000 per grant)." };

  try {
    await getBillingService().grantCredit(ownerId, cents, `admin:${randomUUID()}`);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Grant failed." };
  }
  revalidatePath(`/admin/billing/${ownerId}`);
  revalidatePath("/admin/billing");
  return { ok: true };
}
