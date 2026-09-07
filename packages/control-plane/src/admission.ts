/**
 * Global admission control for operations that RECREATE a pod's machine.
 *
 * The per-call cap (`BULK_UPDATE_CONCURRENCY = 3`) bounds ONE caller. It does not bound the box:
 * two owners each running a bulk update get 3 lanes apiece, an admin sweep adds more, and a
 * single-pod update or a resize adds more again — so the host sees 6, 9, 12 simultaneous
 * recreates while every individual caller believes it is being polite. That is the shape of the
 * 2026-09-04 outage, where a build saturated the same two NVMe devices that carry every pod.
 *
 * This gate is the missing global bound: whatever the callers do, at most `max` recreates run at
 * once, and waiting work is served FIFO so a fleet-wide sweep cannot starve one owner's single
 * update behind fifty of someone else's.
 *
 * SCOPE — read before trusting it: the gate is per PROCESS. That is genuinely global TODAY because
 * `podway-web` runs exactly one machine and every recreate entry point lives in `apps/web`
 * (verified 2026-09-07). Scale web to two machines and the bound doubles silently. If that day
 * comes the fix is a database-backed lease, in the shape `claimProvisioning` already uses — not a
 * bigger number here.
 */
export interface AdmissionStats {
  running: number;
  waiting: number;
  max: number;
}

export class AdmissionGate {
  private running = 0;
  private queue: (() => void)[] = [];

  constructor(
    private max: number,
    private onEvent?: (event: string, detail: Record<string, unknown>) => void,
  ) {
    if (max < 1) throw new Error("AdmissionGate max must be >= 1");
  }

  stats(): AdmissionStats {
    return { running: this.running, waiting: this.queue.length, max: this.max };
  }

  /**
   * Run `fn` once a slot is free. `label` is for logging only.
   *
   * The slot is released in a `finally`, so a throwing operation can never leak one — a leaked
   * slot is worse than the contention this exists to prevent, because it is permanent.
   */
  async run<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.max) {
      this.onEvent?.("admission_waiting", { label, running: this.running, waiting: this.queue.length + 1, max: this.max });
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      // FIFO: the longest-waiting caller goes next, so one owner's 50-pod sweep cannot starve
      // another owner's single update indefinitely.
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
