/**
 * Pod compute tiers — the size ladder, anchored to RAM. The launch/resize picker offers these
 * presets. CPU and RAM are RESERVED per pod (CPU is a burstable ceiling, overcommitted); disk is a
 * grow-only quota — a pod resized DOWN keeps its larger disk, so a pod is stored as (size, diskGb)
 * where diskGb may exceed the size's own disk. Each size also carries its flat monthly price (cloud;
 * self-host ignores it). See docs/strategy/pricing-model.md.
 *
 * The ladder is RAM-anchored with disk in the box's natural ratio (~13 GB/GB) — so RAM and disk fill
 * up together (size-based-pod-pricing). Sizes: mini 1 · s 2 · m 4 · l 8 · xl 16 GB.
 */

export type PodSize = "mini" | "s" | "m" | "l" | "xl";

export interface PodResources {
  cpus: number;
  memoryGb: number;
  diskGb: number;
}

export interface PodTier extends PodResources {
  label: string;
  /** Flat price per month in USD (cloud edition). */
  monthlyUsd: number;
}

export const POD_TIERS: Record<PodSize, PodTier> = {
  mini: { label: "Mini", cpus: 1, memoryGb: 1, diskGb: 12, monthlyUsd: 4 },
  s: { label: "Small", cpus: 2, memoryGb: 2, diskGb: 25, monthlyUsd: 7 },
  m: { label: "Medium", cpus: 2, memoryGb: 4, diskGb: 50, monthlyUsd: 12 },
  l: { label: "Large", cpus: 4, memoryGb: 8, diskGb: 100, monthlyUsd: 22 },
  xl: { label: "XL", cpus: 6, memoryGb: 16, diskGb: 180, monthlyUsd: 42 },
};

export const POD_SIZES: PodSize[] = ["mini", "s", "m", "l", "xl"];

/** The default size that runs the prebuilt stack (Next build + in-pod Postgres). Mini/Small are too
 * small for that, so the default is Medium. Also the backfill value for a legacy row missing a size. */
export const DEFAULT_POD_SIZE: PodSize = "m";

/** Flat monthly price (USD) for a size — cloud only. */
export function priceForSize(size: PodSize): number {
  return POD_TIERS[size].monthlyUsd;
}

/** Flat rate a SUSPENDED pod bills, any size (its disk is archived off the box). */
export const SUSPENDED_USD = 1;

/**
 * The one-time signup credit granted once a card is on file (cents). This is the SINGLE source of
 * truth for the "$15 free" figure — both the control-plane grant (`SIGNUP_CREDIT_CENTS` re-exported
 * from billing) and the customer-facing dollar figure (`SIGNUP_CREDIT_USD` in the web pricing
 * catalog) derive from it, so the advertised amount and the amount actually granted can never drift.
 */
export const SIGNUP_CREDIT_CENTS = 1500;

/**
 * Per-account RAM budget (GB) — the pre-billing abuse limit that replaced the old "slot" budget
 * (size-based-pod-pricing). A running pod counts its size's RAM against it; a SUSPENDED pod frees it.
 * Default 16 GB (≈ four Mediums, or one XL); `PODWAY_ACCOUNT_RAM_GB` overrides it without a deploy.
 * Read server-side only — the client receives the cap as a prop.
 */
export const ACCOUNT_RAM_GB =
  Number(typeof process !== "undefined" ? process.env?.PODWAY_ACCOUNT_RAM_GB : undefined) || 16;

/** RAM (GB) a pod of this size reserves — the unit the account budget is spent in. */
export function ramGbForSize(size: PodSize): number {
  return POD_TIERS[size].memoryGb;
}

export function isPodSize(x: unknown): x is PodSize {
  return x === "mini" || x === "s" || x === "m" || x === "l" || x === "xl";
}

/**
 * Resolve a stored (size, diskGb) to the concrete resources a provider needs.
 * diskGb is passed through (it's the high-water mark and may be larger than the
 * size's default); CPU/RAM come from the size preset.
 */
export function resolveResources(size: PodSize, diskGb: number): PodResources {
  const t = POD_TIERS[size];
  return { cpus: t.cpus, memoryGb: t.memoryGb, diskGb: Math.max(diskGb, t.diskGb) };
}

/** Human label for a stored (size, diskGb): the tier name, plus a disk note when
 * the pod kept a larger disk than its current size implies (a resize-down). */
export function labelForPod(size: PodSize, diskGb: number): string {
  const t = POD_TIERS[size];
  return diskGb > t.diskGb ? `${t.label} · ${diskGb} GB disk` : t.label;
}
