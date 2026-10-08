import "server-only";

import { ACCOUNT_RAM_GB, CARDED_RAM_GB, noCardRamGb, offerRamGb } from "@podway/shared/tiers";
import { isAdmin } from "./access-rules";
import { editionOss } from "./session";
import { getBillingService } from "./pod-service";
import { stripeConfigured } from "@podway/control-plane";
import { getAccountRef, accountOffer } from "./attribution";

/**
 * The account's pod-RAM budget (GB) — the ceiling on total running-pod RAM.
 *
 * - Admins and self-host are unbounded.
 * - A user WITH a card on file gets the higher carded budget: they pay per pod beyond their free
 *   credit, so the free-tier budget must not hard-block them (velsa: "current users should be able to
 *   create a pod when they have credit"). A generous ceiling still guards against a runaway bill.
 * - Everyone else gets the free-tier budget.
 */
export async function accountRamCapGb(userId: string, email: string): Promise<number> {
  if (isAdmin(email) || editionOss()) return Infinity;
  // E2E ONLY: the suite lifts the budget for everyone (one user launches many pods), so ONE dedicated
  // account keeps a real budget to exercise the gate in a browser. "email=GB"; inert without test login.
  const [tightEmail, tightGb] = (process.env.PODWAY_E2E_TIGHT_RAM ?? "").split("=");
  if (process.env.PODWAY_TEST_LOGIN === "1" && tightEmail && email === tightEmail) return Number(tightGb);
  if (!stripeConfigured()) return ACCOUNT_RAM_GB; // billing off → only the free budget exists
  const hasCard = await getBillingService()
    .getAccount(userId)
    .then((a) => a.hasCard)
    .catch(() => false);
  if (hasCard) return CARDED_RAM_GB;
  const [ref, offer] = await Promise.all([getAccountRef(userId).catch(() => null), accountOffer(userId).catch(() => null)]);
  return noCardRamGb(ref, offerRamGb(offer)); // lead passes + free-pod offers: shared/tiers.ts
}
