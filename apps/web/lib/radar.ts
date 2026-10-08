import "server-only";

import { createAppDb, desc, radarSnapshots, type Database } from "@podway/db";

/** One fresh upgrade-break report (public GitHub data only — no names or emails). */
export interface RadarItem {
  app: string;
  slug: string;
  repo: string;
  issueUrl: string;
  issueNumber: number;
  title: string;
  whatBroke: string;
  opened: string; // YYYY-MM-DD
  state: "open" | "closed";
  fromVersion: string | null;
  toVersion: string | null;
}

export interface RadarFeed {
  updated: string; // YYYY-MM-DD
  appsWatched: number;
  windowDays: number;
  items: RadarItem[];
}

const MAX_ITEMS = 500;
const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null;
const day = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const optStr = (v: unknown, max: number): string | null => (v == null ? null : str(v, max));

/** Validate the GTM pod's radar-public.json (its snake_case shape). Strict: an item that is not a public
 * GitHub issue link, or has an over-long field, is dropped — the pages render this verbatim. Null when
 * the envelope itself is wrong. */
export function parseRadarFeed(raw: unknown, rejects?: string[]): RadarFeed | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const updated = day(o.updated);
  if (!updated || !Array.isArray(o.items) || o.items.length > MAX_ITEMS) return null;
  const items: RadarItem[] = [];
  for (const [i, r] of (o.items as Record<string, unknown>[]).entries()) {
    if (!r || typeof r !== "object") {
      rejects?.push(`item ${i}: not an object`);
      continue;
    }
    const issueUrl = str(r.issue_url, 300);
    const item = {
      app: str(r.app, 60),
      slug: str(r.slug, 60),
      repo: str(r.repo, 120),
      issueUrl: issueUrl && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+$/.test(issueUrl) ? issueUrl : null,
      issueNumber: typeof r.issue_number === "number" && Number.isInteger(r.issue_number) ? r.issue_number : null,
      title: str(r.title, 300),
      whatBroke: str(r.what_broke ?? r.title, 300),
      opened: day(r.opened),
      state: r.state === "closed" ? "closed" : r.state === "open" ? "open" : null,
      fromVersion: optStr(r.from_version, 40),
      toVersion: optStr(r.to_version, 40),
    };
    // Name each bad field so the sender can fix its feed (GTM: 23 of 37 dropped with no reason, 2026-10-08).
    const bad = Object.entries(item)
      .filter(([k, v]) => v === null && k !== "fromVersion" && k !== "toVersion")
      .map(([k]) => k);
    if (item.slug && !/^[a-z0-9-]+$/.test(item.slug)) bad.push("slug");
    if (bad.length) {
      rejects?.push(`item ${i} (${typeof r.slug === "string" ? r.slug.slice(0, 60) : "?"}): bad ${bad.join(", ")}`);
      continue;
    }
    items.push(item as RadarItem);
  }
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 10_000 ? v : d);
  return { updated, appsWatched: num(o.apps_watched, 0), windowDays: num(o.window_days, 30), items };
}

export async function saveRadarFeed(feed: RadarFeed, db: Database = createAppDb()): Promise<void> {
  await db.insert(radarSnapshots).values({ data: feed });
}

/** The newest accepted feed, or null (none yet / DB unreachable — pages then hide the radar parts). */
export async function latestRadarFeed(db: Database = createAppDb()): Promise<RadarFeed | null> {
  try {
    const [row] = await db.select().from(radarSnapshots).orderBy(desc(radarSnapshots.id)).limit(1);
    return row ? (row.data as RadarFeed) : null; // validated by parseRadarFeed before it was stored
  } catch {
    return null;
  }
}
