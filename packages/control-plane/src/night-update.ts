/**
 * Night auto-update (owner, 2026-10-13): for an account that turned on "Update idle pods automatically at
 * night", run the SAME idle bulk update the dashboard button runs (PodService.updateIdlePods — its rules
 * decide eligibility, not this file) once a night between 03:00 and 05:00 in the owner's timezone, then
 * email one summary: what updated, what was skipped and why. Default off.
 *
 * Pure of I/O: every side effect is a dependency. The box is protected by updateIdlePods' own
 * concurrency cap + the global recreate gate (no separate "a pod-base build is running" signal exists).
 * ponytail: the "ran tonight" mark is in memory, so a gateway restart inside the window can run a second
 * pass (harmless: updated pods are no longer behind) and send a second email; persist it if that annoys.
 */
import type { WatchEmail } from "./app-watch.js";

export interface NightOwner {
  id: string;
  /** IANA timezone, set when the owner turned the setting on. */
  tz: string;
  name: string | null;
  email: string | null;
}

/** A pod that is behind the pinned image (the summary's universe). */
export interface BehindPod {
  id: string;
  name: string | null;
  status: string;
  autoUpdate: string;
  t3Control: boolean;
}

export interface NightUpdateDeps {
  listOwners: () => Promise<NightOwner[]>;
  behindPods: (ownerId: string) => Promise<BehindPod[]>;
  /** PodService.updateIdlePods for this owner → the pod ids it started. */
  updateIdle: (ownerId: string) => Promise<string[]>;
  sendEmail: (to: string, subject: string, content: WatchEmail) => Promise<void>;
  appUrl: string;
  now?: () => Date;
}

export const NIGHT_START_HOUR = 3;
export const NIGHT_END_HOUR = 5;

/** The owner's local date (YYYY-MM-DD) and hour, or null for an unknown timezone. */
export function localDateHour(now: Date, tz: string): { date: string; hour: number } | null {
  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
        .formatToParts(now)
        .map((x) => [x.type, x.value]),
    );
    return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
  } catch {
    return null;
  }
}

/** Why an eligible-looking pod was not updated, in the owner's words. */
function skipReason(p: BehindPod): string {
  if (p.autoUpdate === "off") return "auto-update is off for this pod";
  if (p.t3Control) return "T3 Code is driving it";
  if (p.status !== "running") return `it is ${p.status}`;
  return "its agent was busy or recently active";
}

export class NightUpdateService {
  private readonly ranOn = new Map<string, string>(); // ownerId → local date of the last run

  constructor(private readonly deps: NightUpdateDeps) {}

  /** One pass (call every ~15 min). Returns the owners that ran this pass. */
  async sweep(): Promise<string[]> {
    const now = (this.deps.now ?? (() => new Date()))();
    const ran: string[] = [];
    for (const o of await this.deps.listOwners()) {
      const local = localDateHour(now, o.tz);
      if (!local || local.hour < NIGHT_START_HOUR || local.hour >= NIGHT_END_HOUR) continue;
      if (this.ranOn.get(o.id) === local.date) continue;
      this.ranOn.set(o.id, local.date);
      ran.push(o.id);
      const behind = await this.deps.behindPods(o.id).catch(() => []);
      if (behind.length === 0) continue; // nothing to do, nothing to say
      const started = new Set(await this.deps.updateIdle(o.id).catch(() => []));
      await this.email(o, behind, started);
    }
    return ran;
  }

  private async email(o: NightOwner, behind: BehindPod[], started: Set<string>): Promise<void> {
    if (!o.email) return;
    const label = (p: BehindPod) => p.name ?? p.id;
    const updated = behind.filter((p) => started.has(p.id));
    const skipped = behind.filter((p) => !started.has(p.id));
    const paragraphs: string[] = [];
    if (updated.length) paragraphs.push(`Updated: ${updated.map(label).join(", ")}.`);
    for (const p of skipped) paragraphs.push(`Not updated: ${label(p)} — ${skipReason(p)}. It will try again tomorrow night.`);
    const subject = updated.length
      ? `Podway updated ${updated.length} pod${updated.length === 1 ? "" : "s"} last night`
      : "Podway could not update your pods last night";
    await this.deps
      .sendEmail(o.email, subject, {
        name: o.name,
        heading: subject,
        paragraphs,
        button: { label: "Open your pods", url: `${this.deps.appUrl}/dashboard` },
        footer: "You turned on night updates in Settings. Turn them off there at any time.",
      })
      .catch(() => undefined);
  }
}
