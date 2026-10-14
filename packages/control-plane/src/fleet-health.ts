/**
 * Fleet health alerts (owner, 2026-10-13): every 15 min the gateway reads each running pod's /healthz and
 * tells ops Telegram ONCE when a pod newly has a problem, and once when it clears. No repeats in between.
 * Pure of I/O, like app-watch.ts. ponytail: state is in memory, so a gateway restart re-alerts open
 * problems once; persist it if that ever annoys anyone.
 */
import type { PodHealth } from "@podway/provider";

export interface FleetPod {
  id: string;
  name: string | null;
  health: PodHealth;
}

export interface FleetHealthDeps {
  listPods: () => Promise<FleetPod[]>;
  notify: (text: string) => Promise<void>;
}

export const JOBS_OVERDUE_MS = 2 * 60 * 60_000;

/** Problem → [plain words, sweeps in a row before alerting]. */
const PROBLEMS = {
  "rc-down": ["Remote Control is down (auto-restore gave up)", 1],
  "agent-dead": ["the agent is not running", 2],
  "jobs-overdue": ["scheduled jobs are overdue by more than 2 h", 1],
  "disk-low": ["disk is almost full", 1],
  unreachable: ["the pod-agent does not answer", 2],
} as const;
type Problem = keyof typeof PROBLEMS;

export function problemsOf(h: PodHealth): Problem[] {
  if (h.reachable === false) return ["unreachable"];
  const out: Problem[] = [];
  // Claude only: its `down` means auto-restore gave up. Codex reads `down` for a moment while its
  // daemon starts after a restart (test:1, 2026-10-14) — that is not worth paging ops.
  if (h.agents.some((a) => a.id === "claude-code" && a.rcState === "down")) out.push("rc-down");
  if (h.issues.some((i) => i.id === "session-dead" || i.id.startsWith("agent-not-running:") || i.id.startsWith("repair-gave-up:")))
    out.push("agent-dead");
  if ((h.jobsOverdueMs ?? 0) > JOBS_OVERDUE_MS) out.push("jobs-overdue");
  if (h.issues.some((i) => i.id === "disk-low" || i.id === "disk-critical")) out.push("disk-low");
  return out;
}

export class FleetHealthService {
  /** podId → problem → sweeps in a row seen; negative = alert already sent. */
  private seen = new Map<string, Map<Problem, number>>();
  constructor(private deps: FleetHealthDeps) {}

  async sweep(): Promise<{ checked: number; alerts: number }> {
    const pods = await this.deps.listPods();
    let alerts = 0;
    for (const pod of pods) {
      const s = this.seen.get(pod.id) ?? new Map<Problem, number>();
      this.seen.set(pod.id, s);
      const now = new Set(problemsOf(pod.health));
      const label = `${pod.name ?? pod.id} [${pod.id}]`;
      for (const p of now) {
        const n = s.get(p) ?? 0;
        if (n < 0) continue; // open alert: no repeat
        if (n + 1 >= PROBLEMS[p][1]) {
          s.set(p, -1);
          alerts++;
          await this.deps.notify(`⚠️ Pod health: ${label} — ${PROBLEMS[p][0]}.`).catch(() => undefined);
        } else s.set(p, n + 1);
      }
      for (const [p, n] of s) {
        if (now.has(p) || (now.has("unreachable") && p !== "unreachable")) continue; // unknown ≠ fixed
        s.delete(p);
        if (n < 0) await this.deps.notify(`✅ Resolved: ${label} — ${PROBLEMS[p][0]}.`).catch(() => undefined);
      }
    }
    const ids = new Set(pods.map((p) => p.id));
    for (const id of this.seen.keys()) if (!ids.has(id)) this.seen.delete(id); // stopped/deleted pods
    return { checked: pods.length, alerts };
  }
}
