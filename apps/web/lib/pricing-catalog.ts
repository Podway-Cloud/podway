/**
 * Customer-facing PRICING catalog for the marketing/billing surfaces. Since the tier remap
 * (size-based-pod-pricing), the numbers DERIVE from `@podway/shared` `POD_TIERS` — one source of
 * truth for size + price — and this file only adds display metadata (blurb, tag) and the marketing
 * copy (signup credit). Cloud only; self-host has no per-pod price.
 */
import { POD_TIERS, POD_SIZES, SUSPENDED_USD, SIGNUP_CREDIT_CENTS, type PodSize } from "@podway/shared/tiers";

export type { PodSize };
export { SUSPENDED_USD };

export interface PricingTier {
  id: PodSize;
  name: string;
  ramGb: number;
  vcpu: number;
  diskGb: number;
  monthlyUsd: number;
  blurb: string;
  /** "default" = pre-selected / most popular; "light" = not for heavy builds. */
  tag?: "default" | "light";
}

/** Signup credit granted once a card is on file (advertised figure). DERIVED from the single
 * source of truth (`SIGNUP_CREDIT_CENTS` in `@podway/shared`) so the advertised dollars and the
 * cents actually granted by the control-plane can never drift apart. */
export const SIGNUP_CREDIT_USD = SIGNUP_CREDIT_CENTS / 100;

const META: Record<PodSize, { blurb: string; tag?: "default" | "light" }> = {
  mini: { tag: "light", blurb: "Bots, static sites, small scripts." },
  s: { blurb: "Light apps and prototypes." },
  m: { tag: "default", blurb: "Full-stack apps with a database." },
  l: { blurb: "Production apps and heavier builds." },
  xl: { blurb: "Heavy compute and lots of data." },
};

export const PRICING_TIERS: PricingTier[] = POD_SIZES.map((id) => {
  const t = POD_TIERS[id];
  return {
    id,
    name: t.label,
    ramGb: t.memoryGb,
    vcpu: t.cpus,
    diskGb: t.diskGb,
    monthlyUsd: t.monthlyUsd,
    blurb: META[id].blurb,
    tag: META[id].tag,
  };
});

/** Everything every pod includes, regardless of size. */
export const INCLUDED_FEATURES = [
  "Always-on, 24/7 — no sleeping",
  "The coding agent, prewired",
  "Continue from desktop, mobile, or web",
  "Custom domains + automatic HTTPS",
  "Persistent disk",
  "Unlimited bandwidth",
];

/** Price a running pod by its RAM (GB), via the tier table. Null if no tier matches. */
export function priceForRamGb(ramGb: number): number | null {
  return PRICING_TIERS.find((t) => t.ramGb === ramGb)?.monthlyUsd ?? null;
}

export function tierForRamGb(ramGb: number): PricingTier | null {
  return PRICING_TIERS.find((t) => t.ramGb === ramGb) ?? null;
}

/** Format a whole-dollar monthly price. */
export function fmtUsd(n: number): string {
  return `$${n}`;
}
