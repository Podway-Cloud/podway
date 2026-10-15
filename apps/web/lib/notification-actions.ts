"use server";

import { and, eq, isNull } from "drizzle-orm";
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

/** Night auto-update: ON unless the owner switched it off (default on, owner 2026-10-15). `tz` is the
 * browser's IANA timezone once known (null → the night run uses UTC). Cloud only. */
export async function getNightUpdate(): Promise<{ on: boolean; tz: string | null }> {
  const u = await requireUser();
  const rows = await createAppDb()
    .select({ off: userTable.nightUpdateOff, tz: userTable.nightUpdateTz })
    .from(userTable)
    .where(eq(userTable.id, u.id));
  return { on: !(rows[0]?.off ?? false), tz: rows[0]?.tz ?? null };
}

function validTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz }); // throws on an unknown zone
    return true;
  } catch {
    return false;
  }
}

/** Switch night updates on or off; also stores the browser's timezone. */
export async function setNightUpdate(on: boolean, tz: string): Promise<{ error?: string }> {
  const u = await requireUser();
  if (editionOss()) return { error: "Night updates are a cloud feature." };
  if (!validTz(tz)) return { error: "Unknown timezone." };
  await createAppDb().update(userTable).set({ nightUpdateOff: !on, nightUpdateTz: tz }).where(eq(userTable.id, u.id));
  return {};
}

/** The dashboard reports the browser's timezone once a session; stored only while none is known, so the
 * night run (03:00–05:00 local) stops guessing UTC. */
export async function learnTimezone(tz: string): Promise<void> {
  const u = await requireUser();
  if (editionOss() || !validTz(tz)) return;
  await createAppDb()
    .update(userTable)
    .set({ nightUpdateTz: tz })
    .where(and(eq(userTable.id, u.id), isNull(userTable.nightUpdateTz)));
}
