import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blog";
import { docsSource } from "@/lib/docs-source";
import { editionOss } from "@/lib/session";

const BASE = "https://podway.io";

/** Public, indexable routes only — auth-gated (/dashboard, /new, /pending, /pods) and internal
 * (/api, /admin, /preview, /dev-harness) routes are excluded here and disallowed in robots.ts. */
export default function sitemap(): MetadataRoute.Sitemap {
  // Self-host (OSS) has no public podway.cloud marketing surface to advertise — emit nothing rather
  // than list podway.cloud URLs on the owner's own domain. (robots.ts also disallows all in OSS.)
  if (editionOss()) return [];
  // No lastModified on pages without a real edit date: a lastmod of "now" on every fetch teaches
  // crawlers to ignore it. /signin is left out (no search value).
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/blog`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/selfhost`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/agent-computer`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/cookies`, changeFrequency: "yearly", priority: 0.3 },
  ];
  const posts: MetadataRoute.Sitemap = getAllPosts().map((p) => ({
    url: `${BASE}/blog/${p.slug}`,
    lastModified: new Date(p.date),
    changeFrequency: "monthly",
    priority: 0.7,
  }));
  const docs: MetadataRoute.Sitemap = docsSource.getPages().map((page) => ({
    url: `${BASE}${page.url}`,
    changeFrequency: "monthly",
    priority: page.url === "/docs" ? 0.8 : 0.65,
  }));
  return [...staticRoutes, ...docs, ...posts];
}
