// Client-safe catalog helpers (tag labels, category derivation, number/date formatting) shared by the
// server gallery and the client app grid/card. No server-only imports here — it's bundled to the client.
import type { CatalogEntry } from "@/lib/environments";

// A curated set of human "proof point" labels for a few envs, used as the card's category when present.
export const DASHBOARD_PROOF_POINTS: Record<string, readonly string[]> = {
  "byo-project": ["Repo orientation", "Verified commands", "Testing and review skills"],
  "doc-qa": ["Public assistant", "Owner console", "Grounded citations"],
  "first-10-customers": ["Campaign page", "Private CRM", "Growth workflow"],
  "morning-ops-robot": ["Scheduled jobs", "Alerts", "Daily digest"],
};

export const WORKSPACE_TAG_LABELS: Record<string, string> = {
  nextjs: "Next.js",
  typescript: "TypeScript",
  web: "Web app",
};

// Tags hidden on an APP card: "self-host" is redundant (every app here is self-hosted); "oss" is noise.
const APP_TAG_HIDE = new Set(["self-host", "oss"]);

/** The tags used for the footer category + for filtering (hidden ones removed, mapped to labels). */
export function displayTagsFor(entry: Pick<CatalogEntry, "tags">, variant: string): string[] {
  const tags = variant === "app" ? entry.tags.filter((t) => !APP_TAG_HIDE.has(t)) : entry.tags;
  return tags.map((t) => WORKSPACE_TAG_LABELS[t] ?? t);
}

/** Up to two labels for the card's footer category (a curated set wins when present). */
export function categoriesFor(entry: Pick<CatalogEntry, "name" | "tags">, variant: string): string[] {
  return (DASHBOARD_PROOF_POINTS[entry.name] ?? displayTagsFor(entry, variant)).slice(0, 2);
}

/** 74210 → "74.2k", 1500 → "1.5k", 120000 → "120k", 840 → "840". */
export function formatStars(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 100 ? Math.round(k) : Number(k.toFixed(1))}k`;
}

/** ISO date → "Sep 2026" (the "last updated" signal; month precision is enough). */
export function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
