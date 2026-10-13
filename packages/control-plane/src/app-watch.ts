/**
 * App watch (owner, 2026-10-12): Podway itself — not the agent — checks every app pod every few minutes.
 * Two failed checks in a row = an incident: Podway restarts the app the safe way, re-checks, emails the
 * owner once (what broke, what it did, whether it is back), and wakes the agent to find the root cause.
 * A recovery email closes an incident that the restart did not fix. A full disk is a warning: no
 * restart (it would not help), one email + agent message per day.
 *
 * Pure of I/O: every side effect is a dependency, so the rules are tested without a pod or a database.
 * ponytail: incident state is in memory, so a gateway restart during a long outage can send one more
 * "down" email; persist it (a pods column) if that ever annoys anyone.
 */

export interface WatchedPod {
  id: string;
  name: string | null;
  ownerId: string;
  /** The app's title, e.g. "Uptime Kuma". */
  app: string;
}

/** One check. `down` = the app is not serving (why, in plain words); `warn` = it serves, but act soon. */
export interface Health {
  down: string | null;
  warn: string | null;
}

export interface WatchEmail {
  name?: string | null;
  heading: string;
  paragraphs: (string | { label: string; url: string })[];
  button?: { label: string; url: string };
  footer: string;
}

export interface AppWatchDeps {
  listPods: () => Promise<WatchedPod[]>;
  check: (podId: string) => Promise<Health>;
  /** The safe fix: restart the app's containers (data volumes are kept). */
  restart: (podId: string) => Promise<void>;
  sendPodMessage: (podId: string, ownerId: string, body: string) => Promise<void>;
  owner: (ownerId: string) => Promise<{ name: string | null; email: string | null } | null>;
  sendEmail: (to: string, subject: string, content: WatchEmail) => Promise<void>;
  appUrl: string;
  /** Wait for the app to come back after a restart before re-checking. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export const FAILS_TO_ACT = 2;
export const RESTART_SETTLE_MS = 60_000;
const WARN_EVERY_MS = 24 * 60 * 60_000;

interface State {
  fails: number;
  /** An incident the restart did not fix: the next healthy check sends the recovery email. */
  open: boolean;
  lastWarnAt: number;
}

export class AppWatchService {
  private state = new Map<string, State>();
  constructor(private deps: AppWatchDeps) {}

  async sweep(): Promise<{ checked: number; restarted: string[] }> {
    const pods = await this.deps.listPods();
    const restarted: string[] = [];
    for (const pod of pods) {
      const r = await this.checkOne(pod).catch((e) => (console.error("app_watch_failed", pod.id, e), false));
      if (r) restarted.push(pod.id);
    }
    // Forget pods that are no longer watched (switched off, suspended, deleted).
    const ids = new Set(pods.map((p) => p.id));
    for (const id of this.state.keys()) if (!ids.has(id)) this.state.delete(id);
    return { checked: pods.length, restarted };
  }

  /** true when this check restarted the app. */
  private async checkOne(pod: WatchedPod): Promise<boolean> {
    const s = this.state.get(pod.id) ?? { fails: 0, open: false, lastWarnAt: 0 };
    this.state.set(pod.id, s);
    const h = await this.deps.check(pod.id);
    const now = (this.deps.now ?? Date.now)();

    if (h.warn && now - s.lastWarnAt >= WARN_EVERY_MS) {
      s.lastWarnAt = now;
      await this.notify(pod, `${pod.app} needs attention`, [`${h.warn}.`, "Nothing is down yet. Your AI admin is looking at it."],
        `Podway health check: ${pod.app} — ${h.warn}. Nothing is down yet. Find what is using the space and fix it if it is safe; tell the owner what you did.`);
    }

    if (!h.down) {
      if (s.open) {
        s.open = false;
        await this.notify(pod, `${pod.app} is back up`, [`${pod.app} is serving again.`, "Your AI admin has the details in your Claude chat."], null);
      }
      s.fails = 0;
      return false;
    }

    s.fails++;
    if (s.fails !== FAILS_TO_ACT || s.open) return false;

    await this.deps.restart(pod.id);
    await (this.deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(RESTART_SETTLE_MS);
    const after = await this.deps.check(pod.id);
    const back = !after.down;
    s.open = !back;
    if (back) s.fails = 0;
    await this.notify(
      pod,
      back ? `${pod.app} was down — Podway restarted it` : `${pod.app} is down`,
      back
        ? [`${pod.app} stopped working: ${h.down}.`, "Podway restarted it, and it is serving again. Your AI admin is now looking for the cause."]
        : [`${pod.app} stopped working: ${h.down}.`, `Podway restarted it, but it is still down (${after.down}). Your AI admin is working on it. We will email you when it is back.`],
      `Podway health check: ${pod.app} was down (${h.down}). Podway restarted the app; it is ${back ? "serving again" : `STILL DOWN (${after.down})`}. ` +
        "Read the app's logs, find the root cause, fix it if it is safe (snapshot first), and tell the owner what happened and what you did.",
    );
    return true;
  }

  private async notify(pod: WatchedPod, subject: string, lines: string[], agentBody: string | null): Promise<void> {
    if (agentBody) await this.deps.sendPodMessage(pod.id, pod.ownerId, agentBody).catch(() => undefined);
    const o = await this.deps.owner(pod.ownerId).catch(() => null);
    if (!o?.email) return;
    const url = `${this.deps.appUrl}/dashboard/pods/${pod.id}`;
    await this.deps
      .sendEmail(o.email, subject, {
        name: o.name,
        heading: subject,
        paragraphs: [...lines, `Pod: ${pod.name ?? pod.id}.`],
        button: { label: "Open your pod", url },
        footer: "Podway checks your app every 5 minutes. Turn this off in the pod's Settings tab (Watch app).",
      })
      .catch(() => undefined);
  }
}

/** Read the in-pod probe's output (`http=<code>`, `bad=<svc>(<state>)` lines, `disk=<pct>`). */
export function parseAppHealth(out: string): Health {
  const http = /^http=(\d{3})/m.exec(out)?.[1] ?? "000";
  const bad = [...out.matchAll(/^bad=(\S+)/gm)].map((m) => m[1]!);
  const disk = Number(/^disk=(\d+)/m.exec(out)?.[1] ?? 0);
  const code = Number(http);
  const down =
    code === 0 ? "the app page does not answer"
    : code >= 500 ? `the app page returns an error (HTTP ${code})`
    : bad.length ? `a container stopped: ${bad.join(", ")}`
    : null;
  return { down, warn: disk >= 90 ? `the disk is ${disk}% full` : null };
}
