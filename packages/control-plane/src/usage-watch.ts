/**
 * Abuse watch (open sign-up, 2026-10-07): flags a pod whose HOST-measured usage looks like mining or
 * spam, so ops can look. Alert-only — it never throttles or suspends (the owner decides).
 *
 *   cpu    : CPU time over the last CPU_WINDOW_MS ≥ CPU_SHARE of the pod's vCPUs (sustained, e.g. mining)
 *   egress : bytes the VM sent in the last EGRESS_WINDOW_MS ≥ EGRESS_BYTES (e.g. spam, flooding)
 *
 * Each (pod, kind) alerts at most once per REALERT_MS. ponytail: samples live in memory per gateway
 * process (a deploy restarts the 2h window — worst case a late alert); persist them if alerts must
 * survive restarts.
 */
export const CPU_WINDOW_MS = 2 * 60 * 60_000;
export const CPU_SHARE = 0.9;
export const EGRESS_WINDOW_MS = 60 * 60_000;
export const EGRESS_BYTES = 5 * 1024 ** 3;
export const REALERT_MS = 24 * 60 * 60_000;

export interface UsageSample {
  t: number;
  cpuNs: number;
  txBytes: number;
}

export interface UsageAlert {
  kind: "cpu" | "egress";
  /** One line for the ops alert, e.g. "CPU at 97% of 2 vCPU for 2h". */
  detail: string;
}

export class UsageWatch {
  private readonly samples = new Map<string, UsageSample[]>();
  private readonly alertedAt = new Map<string, number>();

  /** Record one sample for a running pod and return any alert that is due now. */
  sample(podId: string, s: UsageSample, vcpus: number): UsageAlert[] {
    const keep = Math.max(CPU_WINDOW_MS, EGRESS_WINDOW_MS) + 10 * 60_000;
    let list = (this.samples.get(podId) ?? []).filter((x) => s.t - x.t <= keep);
    // Counters reset when the VM restarts: start over rather than read a negative delta.
    if (list.length && (s.cpuNs < list[list.length - 1]!.cpuNs || s.txBytes < list[list.length - 1]!.txBytes)) list = [];
    list.push(s);
    this.samples.set(podId, list);

    const alerts: UsageAlert[] = [];
    const span = (windowMs: number) => list.find((x) => s.t - x.t >= windowMs * 0.95 && s.t - x.t <= windowMs * 1.2);

    const c = span(CPU_WINDOW_MS);
    if (c && vcpus > 0) {
      const share = (s.cpuNs - c.cpuNs) / ((s.t - c.t) * 1e6 * vcpus);
      if (share >= CPU_SHARE) alerts.push({ kind: "cpu", detail: `CPU at ${Math.round(share * 100)}% of ${vcpus} vCPU for ${Math.round((s.t - c.t) / 3_600_000)}h` });
    }
    const e = span(EGRESS_WINDOW_MS);
    if (e) {
      const bytes = s.txBytes - e.txBytes;
      if (bytes >= EGRESS_BYTES) alerts.push({ kind: "egress", detail: `sent ${(bytes / 1024 ** 3).toFixed(1)} GB in the last hour` });
    }
    return alerts.filter((a) => {
      const key = `${podId}:${a.kind}`;
      const last = this.alertedAt.get(key);
      if (last !== undefined && s.t - last < REALERT_MS) return false;
      this.alertedAt.set(key, s.t);
      return true;
    });
  }

  forget(podId: string): void {
    this.samples.delete(podId);
  }
}
