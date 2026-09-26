/**
 * Login-expiry reminders (openspec: login-expiry-reminders). A Claude subscription login hard-expires
 * about every 30 days and nothing on the pod can extend it, so the owner has to reconnect. This sweep
 * tells them in time — a pod system message (their agent relays it) at every threshold, and an email
 * from 3 days — with one link straight to the reconnect wizard.
 *
 * Pure of I/O: every side effect is a dependency, so the schedule and the at-most-once rules are tested
 * without a database. `claimNotice` is the at-most-once gate (the auth_notices primary key): a renewal
 * changes the expiry, so an old schedule can never fire for the new login.
 */

import { and, authNotices, eq, gte, isNotNull, lte, pods, user, type Database } from "@podway/db";

const DAY = 86_400_000;

export interface Threshold {
  id: "14d" | "7d" | "3d" | "2d" | "1d" | "expired";
  /** Fires once `now >= expiresAt - beforeMs`. */
  beforeMs: number;
  email: boolean;
  /** Owner-facing phrase: "expires in 3 days". */
  phrase: string;
}

// Most urgent LAST, so the last reached one wins (a missed sweep never sends a burst of old notices).
export const SUBSCRIPTION_SCHEDULE: Threshold[] = [
  { id: "7d", beforeMs: 7 * DAY, email: false, phrase: "expires in 7 days" },
  { id: "3d", beforeMs: 3 * DAY, email: true, phrase: "expires in 3 days" },
  { id: "2d", beforeMs: 2 * DAY, email: true, phrase: "expires in 2 days" },
  { id: "1d", beforeMs: 1 * DAY, email: true, phrase: "expires tomorrow" },
  { id: "expired", beforeMs: 0, email: true, phrase: "has expired" },
];
export const SETUP_TOKEN_SCHEDULE: Threshold[] = [
  { id: "14d", beforeMs: 14 * DAY, email: true, phrase: "expires in 14 days" },
  { id: "3d", beforeMs: 3 * DAY, email: true, phrase: "expires in 3 days" },
  { id: "expired", beforeMs: 0, email: true, phrase: "has expired" },
];
const SIGNED_OUT: Threshold = { id: "expired", beforeMs: 0, email: true, phrase: "was signed out" };

/** The notice key's expiry, to the hour: the CLI rewrites the credential with sub-second jitter
 * (22:42:10.873 → 22:42:11.424 sent Mentalism academy the 1-day notice twice, 2026-09-25). */
export function expiryKey(iso: string): string {
  const t = Date.parse(iso);
  return new Date(Math.floor(t / 3_600_000) * 3_600_000).toISOString();
}

export function dueThreshold(schedule: Threshold[], expiresAtMs: number, now: number): Threshold | null {
  let due: Threshold | null = null;
  for (const t of schedule) if (now >= expiresAtMs - t.beforeMs) due = t;
  return due;
}

export interface ReminderPod {
  id: string;
  name: string | null;
  ownerId: string;
  agentAuth: string | null;
  claudeLoginExpiresAt: string | null | undefined;
}

/** Structurally the email-templates `EmailContent` (kept local: control-plane does not import auth). */
export interface ReminderEmail {
  name?: string | null;
  heading: string;
  paragraphs: (string | { label: string; url: string })[];
  button?: { label: string; url: string };
  footer: string;
}

export interface LoginReminderDeps {
  listPods: () => Promise<ReminderPod[]>;
  /** Insert-if-absent on (pod, agent, expiresAt, threshold). false = already sent. */
  claimNotice: (n: { podId: string; ownerId: string; agent: string; expiresAt: string; threshold: string }) => Promise<boolean>;
  /** Was any notice sent for this pod+agent with an expiry within an hour of `expiresAt`? (Within an hour,
   * not equal: notices sent before the hour-key existed carry the exact expiry.) */
  hasNotice: (podId: string, agent: string, expiresAt: string) => Promise<boolean>;
  sendPodMessage: (podId: string, ownerId: string, body: string) => Promise<void>;
  owner: (ownerId: string) => Promise<{ name: string | null; email: string | null; reminderEmails: boolean } | null>;
  sendEmail: (to: string, subject: string, content: ReminderEmail) => Promise<void>;
  appUrl: string;
}

interface Due {
  pod: ReminderPod;
  t: Threshold;
}

export class LoginReminderService {
  constructor(private readonly deps: LoginReminderDeps) {}

  private link(podId: string): string {
    return `${this.deps.appUrl}/dashboard/pods/${podId}?tab=control&wiz=reconnect:claude-code`;
  }

  /** One pass: every pod's most urgent unsent threshold → pod message; email-worthy ones → one email per owner. */
  async sweep(now = Date.now()): Promise<void> {
    const byOwner = new Map<string, Due[]>();
    for (const pod of await this.deps.listPods()) {
      if (!pod.claudeLoginExpiresAt || pod.agentAuth === "api-key") continue;
      const schedule = pod.agentAuth === "setup-token" ? SETUP_TOKEN_SCHEDULE : SUBSCRIPTION_SCHEDULE;
      const t = dueThreshold(schedule, Date.parse(pod.claudeLoginExpiresAt), now);
      if (!t) continue;
      const due = await this.notify(pod, pod.claudeLoginExpiresAt, t);
      if (due) byOwner.set(pod.ownerId, [...(byOwner.get(pod.ownerId) ?? []), due]);
    }
    for (const [ownerId, items] of byOwner) await this.email(ownerId, items).catch(() => undefined);
  }

  /** The login was renewed (expiry moved forward). If a reminder went out for the OLD login, tell the pod
   * ONCE that it is resolved — an agent that noted it as an owner task otherwise keeps asking (owner report
   * 2026-09-26). No reminder → nothing to retract. */
  async notifyRenewed(pod: ReminderPod, oldExpiresAt: string, newExpiresAt: string): Promise<void> {
    const oldKey = expiryKey(oldExpiresAt);
    if (!(await this.deps.hasNotice(pod.id, "claude-code", oldExpiresAt))) return;
    const fresh = await this.deps.claimNotice({ podId: pod.id, ownerId: pod.ownerId, agent: "claude-code", expiresAt: oldKey, threshold: "renewed" });
    if (!fresh) return;
    await this.deps
      .sendPodMessage(
        pod.id,
        pod.ownerId,
        `Podway: RESOLVED — Claude's login on this pod was renewed (now valid until ${new Date(newExpiresAt).toUTCString().slice(0, 16)}). ` +
          "The earlier reconnect reminder no longer applies: remove it from any task list, register or 0asks file, and do not mention it again.",
      )
      .catch(() => undefined);
  }

  /** A live sign-out BEFORE the expiry date (revoked/rejected): the "expired" notice, now, once. */
  async notifySignedOut(pod: ReminderPod, _now = Date.now()): Promise<void> {
    if (!pod.claudeLoginExpiresAt || pod.agentAuth === "api-key") return;
    const due = await this.notify(pod, pod.claudeLoginExpiresAt, SIGNED_OUT);
    if (due) await this.email(pod.ownerId, [due]).catch(() => undefined);
  }

  private async notify(pod: ReminderPod, expiresAt: string, t: Threshold): Promise<Due | null> {
    const fresh = await this.deps.claimNotice({ podId: pod.id, ownerId: pod.ownerId, agent: "claude-code", expiresAt: expiryKey(expiresAt), threshold: t.id });
    if (!fresh) return null;
    const when = t.id === "expired" ? "" : ` (on ${new Date(expiresAt).toUTCString().slice(0, 16)})`;
    await this.deps
      .sendPodMessage(
        pod.id,
        pod.ownerId,
        `Podway: Claude's login on this pod ${t.phrase}${when}. ` +
          (t.id === "expired"
            ? "Claude stays stopped until the owner signs in again. "
            : "When it expires, Claude stops until the owner signs in again. ") +
          `Tell the owner ONCE, at a natural point in the conversation, and give them this link to reconnect ` +
          `(about a minute; the conversation is kept): ${this.link(pod.id)}. ` +
          "This is a status notice, NOT a task: do not add it to any task list, register or 0asks file. " +
          "If Podway later says it is RESOLVED, drop it.",
      )
      .catch(() => undefined);
    return t.email ? { pod, t } : null;
  }

  private async email(ownerId: string, items: Due[]): Promise<void> {
    const o = await this.deps.owner(ownerId);
    if (!o?.email || !o.reminderEmails) return;
    // Most urgent first; it names the subject and owns the button.
    const order = ["expired", "1d", "2d", "3d", "7d", "14d"];
    items.sort((a, b) => order.indexOf(a.t.id) - order.indexOf(b.t.id));
    const lead = items[0]!;
    const podName = (p: ReminderPod) => p.name?.trim() || p.id;
    const subject =
      items.length === 1
        ? `Claude's login on ${podName(lead.pod)} ${lead.t.phrase}`
        : `Claude's login ${lead.t.phrase} on ${podName(lead.pod)} — and ${items.length - 1} more pod${items.length > 2 ? "s" : ""}`;
    await this.deps.sendEmail(o.email, subject, {
      name: o.name,
      heading: items.length === 1 ? `Reconnect Claude on ${podName(lead.pod)}` : `Reconnect Claude on ${items.length} pods`,
      paragraphs: [
        lead.t.id === "expired"
          ? `Claude's login on ${podName(lead.pod)} ${lead.t.phrase}. Claude is stopped there until you sign in again.`
          : `Claude's login on ${podName(lead.pod)} ${lead.t.phrase}. When it expires, Claude stops until you sign in again.`,
        "Reconnecting takes about a minute and keeps your conversation.",
        ...items.slice(1).map((d) => ({ label: `${podName(d.pod)} — ${d.t.phrase}`, url: this.link(d.pod.id) })),
      ],
      button: { label: items.length === 1 ? "Reconnect Claude" : `Reconnect ${podName(lead.pod)}`, url: this.link(lead.pod.id) },
      footer: "You're getting this because you own these pods. You can turn off login reminder emails in your account settings.",
    });
  }
}

/** The database half of the deps: pods with a known expiry, the at-most-once claim (the auth_notices
 * primary key + ON CONFLICT DO NOTHING), and the owner's reminder-email setting. */
export function drizzleReminderDeps(db: Database): Pick<LoginReminderDeps, "listPods" | "claimNotice" | "hasNotice" | "owner"> {
  return {
    listPods: async () =>
      (
        await db
          .select({ id: pods.id, name: pods.name, ownerId: pods.ownerId, agentAuth: pods.agentAuth, status: pods.status, exp: pods.claudeLoginExpiresAt })
          .from(pods)
          .where(isNotNull(pods.claudeLoginExpiresAt))
      )
        .filter((p) => p.status !== "destroying")
        .map((p) => ({ id: p.id, name: p.name, ownerId: p.ownerId, agentAuth: p.agentAuth, claudeLoginExpiresAt: p.exp?.toISOString() ?? null })),
    claimNotice: async (n) =>
      (
        await db
          .insert(authNotices)
          .values({ podId: n.podId, ownerId: n.ownerId, agent: n.agent, expiresAt: new Date(n.expiresAt), threshold: n.threshold })
          .onConflictDoNothing()
          .returning({ podId: authNotices.podId })
      ).length > 0,
    hasNotice: async (podId, agent, expiresAt) =>
      (
        await db
          .select({ t: authNotices.threshold })
          .from(authNotices)
          .where(
            and(
              eq(authNotices.podId, podId),
              eq(authNotices.agent, agent),
              gte(authNotices.expiresAt, new Date(Date.parse(expiresAt) - 3_600_000)),
              lte(authNotices.expiresAt, new Date(Date.parse(expiresAt) + 3_600_000)),
            ),
          )
          .limit(1)
      ).length > 0,
    owner: async (ownerId) => {
      const u = (await db.select().from(user).where(eq(user.id, ownerId)))[0];
      return u ? { name: u.name, email: u.email, reminderEmails: u.reminderEmails } : null;
    },
  };
}
