"use server";

import { eq } from "drizzle-orm";
import { createAppDb, user as userTable } from "@podway/db";
import { requireUser, editionOss } from "./session";

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

/** Night auto-update (owner, 2026-10-13): the account's IANA timezone when ON, null when off. Cloud only. */
export async function getNightUpdateTz(): Promise<string | null> {
  const u = await requireUser();
  const rows = await createAppDb().select({ tz: userTable.nightUpdateTz }).from(userTable).where(eq(userTable.id, u.id));
  return rows[0]?.tz ?? null;
}

/** Turn night updates on (with the browser's timezone) or off (`null`). */
export async function setNightUpdateTz(tz: string | null): Promise<{ error?: string }> {
  const u = await requireUser();
  if (editionOss()) return { error: "Night updates are a cloud feature." };
  if (tz !== null) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz }); // throws on an unknown zone
    } catch {
      return { error: "Unknown timezone." };
    }
  }
  await createAppDb().update(userTable).set({ nightUpdateTz: tz }).where(eq(userTable.id, u.id));
  return {};
}
