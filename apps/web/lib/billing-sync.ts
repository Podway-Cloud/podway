import "server-only";

import { editionOss } from "./session";
import { getBillingService, getPodService } from "./pod-service";
import { stripeConfigured } from "@podway/control-plane";

/** Billing is a cloud concept, and only usable once Stripe is configured. */
function billingOff(): boolean {
  return editionOss() || !stripeConfigured();
}

/**
 * Reconcile an owner's Stripe subscription to their current pods (2b). BEST-EFFORT: a Stripe hiccup
 * must never fail the pod action that triggered it — the reconcile is idempotent and self-heals on the
 * next call. No-op unless billing is on and a card is on file (syncSubscription guards that too).
 *
 * INTERNAL server helper — NOT a server action. It takes a caller-supplied `ownerId`, so it must never
 * be reachable as a directly-invocable POST: exported from a `"use server"` module it was, which let any
 * caller force a Stripe reconcile against ANY owner's account (pre-alpha security audit H2, 2026-08-06;
 * inert only because billing was off). It lives here, behind `server-only`, and every caller passes its
 * OWN session user id (launchPod/wake/sleep/resize/destroy, markCardSaved).
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
