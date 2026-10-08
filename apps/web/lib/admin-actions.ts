"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { createAppDb, user as userTable } from "@podway/db";
import { sendApprovalEmail } from "@podway/auth";
import { requireAdmin } from "./access";
import { getPodService } from "./pod-service";
import { createLogger } from "@podway/shared/log";

const log = createLogger("web");

export async function approveUser(userId: string): Promise<void> {
  await requireAdmin();
  const db = createAppDb();
  // Email ONLY on the unapproved→approved transition — re-approving an already-approved user
  // (or an idempotent double-click) must not spam them. Read first, then send only if it flips.
  const [before] = await db
    .select({ approved: userTable.approved, email: userTable.email, name: userTable.name, pendingStart: userTable.pendingStart })
    .from(userTable)
    .where(eq(userTable.id, userId));
  // Approving also clears any "Later" hold — an approved user is no longer a set-aside request.
  await db.update(userTable).set({ approved: true, deferredAt: null }).where(eq(userTable.id, userId));
  if (before && !before.approved) {
    // Best-effort: never let the "you're in" email fail the approval itself.
    await sendApprovalEmail({ name: before.name, email: before.email }, {}, before.pendingStart);
  }
  revalidatePath("/admin");
}

export async function revokeUser(userId: string): Promise<void> {
  await requireAdmin();
  await createAppDb().update(userTable).set({ approved: false }).where(eq(userTable.id, userId));
  // Revoke also stops what the user runs (abuse response): suspend every running pod. Data stays.
  const svc = getPodService();
  for (const pod of await svc.listPods(userId)) {
    if (pod.status === "running") await svc.adminSleep(pod.id).catch((err) => log.error("revoke_suspend_failed", { podId: pod.id, err }));
  }
  revalidatePath("/admin");
}

/** "Later": set a pending access request aside to revisit, without approving or rejecting it.
 * It leaves the pending list and moves to the Later tab. No email is sent. */
export async function deferUser(userId: string): Promise<void> {
  await requireAdmin();
  await createAppDb().update(userTable).set({ deferredAt: new Date() }).where(eq(userTable.id, userId));
  revalidatePath("/admin");
}

/** Move a "Later" request back into the pending queue. */
export async function undeferUser(userId: string): Promise<void> {
  await requireAdmin();
  await createAppDb().update(userTable).set({ deferredAt: null }).where(eq(userTable.id, userId));
  revalidatePath("/admin");
}
