import "server-only";
import { eq, and, isNull } from "drizzle-orm";
import { createAppDb, user as userTable } from "@podway/db";
import { sanitizeRef } from "@podway/shared";

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
