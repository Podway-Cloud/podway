import "server-only";

import { ACCOUNT_RAM_GB, CARDED_RAM_GB } from "@podway/shared/tiers";
import { isAdmin } from "./access-rules";
import { editionOss } from "./session";
import { getBillingService } from "./pod-service";
import { stripeConfigured } from "@podway/control-plane";

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
  if (!stripeConfigured()) return ACCOUNT_RAM_GB; // billing off → only the free budget exists
  const hasCard = await getBillingService()
    .getAccount(userId)
    .then((a) => a.hasCard)
    .catch(() => false);
  return hasCard ? CARDED_RAM_GB : ACCOUNT_RAM_GB;
}
