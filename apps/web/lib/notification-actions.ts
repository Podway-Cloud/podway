"use server";

import { eq } from "drizzle-orm";
import { createAppDb, user as userTable } from "@podway/db";
import { requireUser } from "./session";

/** Login-expiry reminder EMAILS (login-expiry-reminders). The dashboard ribbon and the pod message are
 * not affected by this setting. */
export async function getReminderEmails(): Promise<boolean> {
  const u = await requireUser();
  const rows = await createAppDb().select({ on: userTable.reminderEmails }).from(userTable).where(eq(userTable.id, u.id));
  return rows[0]?.on ?? true;
}

export async function setReminderEmails(on: boolean): Promise<void> {
  const u = await requireUser();
  await createAppDb().update(userTable).set({ reminderEmails: on === true }).where(eq(userTable.id, u.id));
}
