"use server";

import { requireUser, editionOss } from "./session";
import { getBillingService, getPodService } from "./pod-service";
import { stripeConfigured, stripePublishableKey } from "@podway/control-plane";

/** Billing is a cloud concept, and only usable once Stripe is configured. */
function billingOff(): boolean {
  return editionOss() || !stripeConfigured();
}

export async function billingEnabled(): Promise<boolean> {
  return !billingOff();
}

/** Card-on-file + credit state for the billing page. Null when billing isn't enabled. */
export async function getBillingSummary(): Promise<{ hasCard: boolean; creditCents: number } | null> {
  if (billingOff()) return null;
  const user = await requireUser();
  const a = await getBillingService().getAccount(user.id);
  return { hasCard: a.hasCard, creditCents: a.creditCents };
}

/** The owner's recent Stripe invoices for the billing page. Empty when billing is off / no customer. */
export async function getInvoices() {
  if (billingOff()) return [];
  const user = await requireUser();
  return getBillingService().listInvoices(user.id);
}

/** The owner's default card (brand/last4/expiry), or null when billing is off / no card on file. */
export async function getPaymentMethod() {
  if (billingOff()) return null;
  const user = await requireUser();
  return getBillingService().getPaymentMethod(user.id);
}

/** Remove (detach) the owner's card. No-op when billing is off. Best-effort; refresh reflects it. */
export async function removeCard(): Promise<{ ok: boolean; error?: string }> {
  if (billingOff()) return { ok: false, error: "Billing isn't enabled." };
  const user = await requireUser();
  try {
    await getBillingService().detachPaymentMethod(user.id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't remove the card." };
  }
}

/** Credit-grant history (signup + referral) for the Overview tab. Empty when billing is off. */
export async function getCreditGrants() {
  if (billingOff()) return [];
  const user = await requireUser();
  return getBillingService().listCreditGrants(user.id);
}

/** Referral status (joined / pending / earned) for the Referral tab. Zeros when billing is off. */
export async function getReferralStatus() {
  if (billingOff()) return { joined: 0, pending: 0, earned: 0, earnedCents: 0 };
  const user = await requireUser();
  return getBillingService().getReferralStatus(user.id);
}

/** When the next charge lands (unix seconds), or null when billing is off / no subscription. */
export async function getNextChargeDate(): Promise<number | null> {
  if (billingOff()) return null;
  const user = await requireUser();
  return getBillingService().getNextChargeDate(user.id);
}

/**
 * Begin the add-card flow: a Stripe SetupIntent whose client secret the browser's Stripe Elements
 * uses to save the card WITHOUT the number touching our servers. Returns the publishable key too
 * (safe for the browser).
 */
export async function startAddCard(): Promise<{ clientSecret: string; pubKey: string } | { error: string }> {
  if (billingOff()) return { error: "Billing isn't enabled." };
  const pubKey = stripePublishableKey();
  if (!pubKey) return { error: "Card payments aren't fully configured yet." };
  const user = await requireUser();
  try {
    const { clientSecret } = await getBillingService().createSetupIntent(user.id, user.email);
    return { clientSecret, pubKey };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't start card setup." };
  }
}

/** Mark that a card is on file, once Elements confirms the SetupIntent succeeded (belt; the 2d
 * webhook is the authoritative confirmation). */
export async function markCardSaved(): Promise<void> {
  if (billingOff()) return;
  const user = await requireUser();
  const billing = getBillingService();
  await billing.setHasCard(user.id, true);
  // First card on file → grant the one-time signup credit + the referred-side referral credit (both
  // idempotent), then bring the subscription in line with the owner's pods (credit auto-applies).
  await billing.grantSignupCredit(user.id).catch(() => undefined);
  await billing.grantReferralReferred(user.id).catch(() => undefined);
  await syncOwnerBilling(user.id);
}

/**
 * Reconcile the owner's Stripe subscription to their current pods (2b). BEST-EFFORT: a Stripe hiccup
 * must never fail the pod action that triggered it — the reconcile is idempotent and self-heals on the
 * next call. No-op unless billing is on and a card is on file (syncSubscription guards that too).
 */
export async function syncOwnerBilling(ownerId: string): Promise<void> {
  if (billingOff()) return;
  try {
    const pods = await getPodService().listPods(ownerId);
    await getBillingService().syncSubscription(
      ownerId,
      pods.map((p) => ({ podId: p.id, size: p.size, status: p.status })),
    );
  } catch (e) {
    console.error("[billing] subscription sync failed (non-fatal):", e instanceof Error ? e.message : e);
  }
}
