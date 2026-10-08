import "server-only";
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";
import { createAppDb, user as userTable } from "@podway/db";
import { sanitizeRef, FREE_POD_OFFERS } from "@podway/shared";

/**
 * Deep-link referral attribution (deeplink-onboarding). `ref` lives on the account as FIRST-TOUCH
 * attribution: set once, at account creation or the first authed `/start?ref=` hit, and NEVER
 * overwritten after that — first-touch is the honest model (a later campaign link for the same
 * account must not steal credit from whatever brought them in the first place). A per-pod `ref`
 * is separate (see launchPod / packages/control-plane): it's the ref active for THAT launch, which
 * may be a fresher `/start?ref=` than the account's original one.
 */

/** Set the account's first-touch `ref`, but ONLY if it has none yet. The `WHERE ref IS NULL` makes
 * this atomic — a plain UPDATE, no read-then-write race with a concurrent request. No-ops on an
 * invalid/oversized ref or one already set. */
export async function recordFirstTouchRef(userId: string, rawRef: string | null | undefined): Promise<void> {
  const ref = sanitizeRef(rawRef);
  if (!ref) return;
  await createAppDb()
    .update(userTable)
    .set({ ref })
    .where(and(eq(userTable.id, userId), isNull(userTable.ref)));
}

/** The account's current (first-touch) `ref`, or null. Used as the fallback attribution for a pod
 * launch that has no fresher session ref of its own. */
export async function getAccountRef(userId: string): Promise<string | null> {
  const rows = await createAppDb()
    .select({ ref: userTable.ref })
    .from(userTable)
    .where(eq(userTable.id, userId));
  return rows[0]?.ref ?? null;
}

/** Remember the /start link (app + ref) an UNAPPROVED account came in through, so approval returns them
 * to it. Latest link wins (they may click a newer campaign link while waiting). Only /start paths. */
export async function savePendingStart(userId: string, startPath: string): Promise<void> {
  if (!startPath.startsWith("/start") || startPath.length > 500) return;
  await createAppDb().update(userTable).set({ pendingStart: startPath }).where(eq(userTable.id, userId));
}

/** Where an approved account should resume: its saved /start link, if any. */
export async function getPendingStart(userId: string): Promise<string | null> {
  const [row] = await createAppDb()
    .select({ pendingStart: userTable.pendingStart })
    .from(userTable)
    .where(eq(userTable.id, userId));
  return row?.pendingStart?.startsWith("/start") ? row.pendingStart : null;
}

/**
 * Free-pod offer claim (owner, 2026-10-08): a /start?ref=<offer key> visit marks this account with that
 * offer while fewer than the offer's `cap` accounts hold it. Set-once (one offer per account); one atomic
 * UPDATE with the count in the WHERE. ponytail: two claims racing at cap-1 can both pass (cap +1);
 * neon-http has no interactive transaction for an advisory lock. Returns true if this call claimed it.
 */
export async function claimOffer(userId: string, offer: string): Promise<boolean> {
  const o = Object.hasOwn(FREE_POD_OFFERS, offer) ? FREE_POD_OFFERS[offer] : undefined;
  if (!o) return false;
  const rows = await createAppDb()
    .update(userTable)
    .set({ freeOffer: offer, freeOfferSince: new Date() })
    .where(
      and(
        eq(userTable.id, userId),
        isNull(userTable.freeOffer),
        sql`(select count(*) from "user" where free_offer = ${offer}) < ${o.cap}`,
      ),
    )
    .returning({ id: userTable.id });
  return rows.length > 0;
}

/** Claims per offer key (the admin counter: N / cap). */
export async function offerCounts(): Promise<Record<string, number>> {
  const rows = await createAppDb()
    .select({ offer: userTable.freeOffer, n: sql<number>`count(*)::int` })
    .from(userTable)
    .where(isNotNull(userTable.freeOffer))
    .groupBy(userTable.freeOffer);
  return Object.fromEntries(rows.map((r) => [r.offer!, r.n]));
}

/** The offer key this account claimed, or null. */
export async function accountOffer(userId: string): Promise<string | null> {
  const [r] = await createAppDb().select({ o: userTable.freeOffer }).from(userTable).where(eq(userTable.id, userId));
  return r?.o ?? null;
}
