import type { BoxStats } from "@podway/shared";
import { POD_TIERS, isPodSize } from "@podway/shared";

/** A pod's promised RAM in MB (its size), from the box row or the tier table. */
export function soldMbOf(p: { size: string; memoryGb?: number }): number {
  const gb = p.memoryGb ?? (isPodSize(p.size) ? POD_TIERS[p.size].memoryGb : 4);
  return gb * 1024;
}

export interface BoxCapacity {
  /** RAM promised to every pod on the box (running or not). */
  soldMb: number;
  /** soldMb / box RAM. */
  overcommit: number;
  /** What pods physically hold: Σ VM resident memory − pages KSM merged (counted once per VM in RSS). */
  podsMb: number;
  /** podsMb ÷ RAM promised to the RUNNING pods — how much of its size an average pod really uses. */
  useRatio: number;
  /** Box RAM in use that is not pods: ZFS cache, host, everything else. */
  otherMb: number;
  freeMb: number;
  /** The sales ceiling (PODWAY_BOX_RAM_GB), or null when unset. */
  gateMb: number | null;
  /** RAM the box would need if pods were sold up to the gate and used it like today. */
  projectedMb: number | null;
  verdict: "fits" | "tight" | "over" | null;
}

/** The capacity model behind /admin/boxes. Only trustworthy when `box.hostMeasured` (otherwise pod RAM is
 * each guest's own view and free RAM is Incus's, which counts guest RAM as cache). */
export function boxCapacity(box: BoxStats, gateGb: number | null): BoxCapacity {
  const soldMb = box.pods.reduce((n, p) => n + soldMbOf(p), 0);
  const running = box.pods.filter((p) => p.status === "running");
  const soldRunningMb = running.reduce((n, p) => n + soldMbOf(p), 0);
  const rssMb = running.reduce((n, p) => n + (p.ramUsedMb ?? 0), 0);
  const podsMb = Math.max(0, rssMb - (box.ksmSavedMb ?? 0));
  const useRatio = soldRunningMb > 0 ? podsMb / soldRunningMb : 0;
  const otherMb = Math.max(0, box.ramUsedMb - podsMb);
  const gateMb = gateGb ? gateGb * 1024 : null;
  const projectedMb = gateMb ? Math.round(useRatio * gateMb + otherMb) : null;
  const verdict =
    projectedMb == null ? null : projectedMb <= box.ramTotalMb * 0.85 ? "fits" : projectedMb <= box.ramTotalMb ? "tight" : "over";
  return {
    soldMb,
    overcommit: box.ramTotalMb > 0 ? soldMb / box.ramTotalMb : 0,
    podsMb,
    useRatio,
    otherMb,
    freeMb: Math.max(0, box.ramTotalMb - box.ramUsedMb),
    gateMb,
    projectedMb,
    verdict,
  };
}
