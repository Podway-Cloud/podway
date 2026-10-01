/**
 * Pod resource-metrics shapes (docs/plans/stats-redesign-plan.md). Produced by the
 * pod-agent's sampler, consumed by the control plane, gateway and web Stats tab.
 * Pure types — no runtime — so every layer can share them without depending on
 * the pod-agent package.
 */

export interface MetricSample {
  /** epoch ms */
  t: number;
  /** busy CPU across all vCPUs, 0–100 */
  cpuPct: number;
  memUsedMb: number;
  memTotalMb: number;
  diskUsedMb: number;
  diskTotalMb: number;
  netRxKbps: number;
  netTxKbps: number;
  /** Claude's own state: busy|shell|idle|waiting (null = unknown). */
  agentStatus: string | null;
  /** Memory-pressure (kernel PSI "some", avg10): the % of the last ~10s the pod stalled waiting on
   * memory. 0 when there's headroom; a sustained high value means the working set exceeds RAM and the
   * pod is thrashing into swap (slow-but-alive). Optional — undefined from pre-pressure agents and in
   * tests / off-Linux (no /proc/pressure/memory). Drives the dashboard "under memory pressure" badge. */
  memPressurePct?: number;
}

export interface DiskBreakdownEntry {
  label: string;
  mb: number;
}

export interface MetricsSnapshot {
  series: MetricSample[];
  disk: { path: string; usedMb: number; totalMb: number; breakdown: DiskBreakdownEntry[] };
  app: { port: number | null; listening: boolean };
  sampleIntervalMs: number;
}

/** A pod as it sits on a box (for the fit visual + overcommit view). */
export interface BoxPod {
  id: string;
  name: string | null;
  size: string;
  slots: number;
  status: string;
  /** RAM the pod holds on the HOST (its VM's resident memory) when the box publishes it; otherwise
   * the guest's own view, which understates it. Null if unreadable. */
  ramUsedMb: number | null;
}

/** Host-level stats for one self-hosted box (docs/plans/box-observability-plan.md).
 * Sourced from the Incus API; `reachable:false` means the numbers are unknown. */
export interface BoxStats {
  name: string;
  region: string;
  reachable: boolean;
  cpuCores: number;
  ramUsedMb: number;
  ramTotalMb: number;
  diskUsedMb: number;
  diskTotalMb: number;
  pods: BoxPod[];
  /** True when RAM numbers come from the box's own /proc (podway-mem-pressure publishes them every
   * minute): ramUsedMb = total − MemAvailable. False/absent = Incus's view, which counts guest RAM
   * (a memfd) as reclaimable cache and so overstates free memory by tens of GB. */
  hostMeasured?: boolean;
  /** ZFS ARC on the box (reclaimable, but capped and wanted). */
  cacheMb?: number;
  /** Memory KSM saves by merging identical pages across pods. */
  ksmSavedMb?: number;
}
