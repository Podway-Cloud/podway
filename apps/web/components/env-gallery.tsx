import { listEnvironments } from "@/lib/environments";
import { fetchRepoMeta } from "@/lib/github-stars";
import { isProvisioningEnabled } from "@/lib/pod-service";
import { editionOss } from "@/lib/session";
import EnvTabs from "@/components/env-tabs";
import AppsGrid from "@/components/apps-grid";
import AppCard, { type CardEntry } from "@/components/app-card";

/**
 * The environments marketplace, split into two TABS (Workspaces default, Apps).
 * - Workspaces (kind: workspace) — open-ended coding envs, ordered A–Z with a curated lead.
 * - Apps (kind: app) — self-hosted OSS apps; fetched with GitHub meta, SORTED BY STARS, tag-filterable.
 * Cards are the presentational client `AppCard`; the star/date meta is fetched here (cached 6h) so the
 * client can sort + filter without a round-trip. (docs/plans/app-catalog/…)
 */
const FEATURED_FIRST: Record<string, number> = { "byo-project": 0 };
const featureRank = (name: string) => FEATURED_FIRST[name] ?? 99;

// Apps hidden from the catalog (owner curation). They stay baked + launchable by direct ?env= link;
// they're just not shown in the browse grid. Edit this set to show/hide an app.
const HIDDEN_APPS = new Set([
  "excalidraw",
  "code-server",
  "gitea",
  "it-tools",
  "filebrowser",
  "homepage",
  "wikijs",
]);

export default async function EnvGallery() {
  const all = await listEnvironments();
  const enabled = isProvisioningEnabled();
  const showApps = !editionOss();

  // Workspaces: A–Z with the curated lead; no GitHub meta.
  const workspaces: CardEntry[] = all
    .filter((e) => e.kind === "workspace")
    .sort((a, b) => featureRank(a.name) - featureRank(b.name) || a.name.localeCompare(b.name))
    .map((e) => ({ ...e, stars: null, updatedAt: null }));

  // Apps: fetch GitHub meta in parallel (cached 6h), then sort by stars desc (nulls last).
  const apps: CardEntry[] = (
    await Promise.all(
      all
        .filter((e) => e.kind === "app" && !HIDDEN_APPS.has(e.name))
        .map(async (e) => {
          const meta = e.sourceUrl ? await fetchRepoMeta(e.sourceUrl) : { stars: null, updatedAt: null };
          return { ...e, stars: meta.stars, updatedAt: meta.updatedAt } as CardEntry;
        }),
    )
  ).sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1));

  return (
    <EnvTabs
      workspaces={
        workspaces.length === 0 ? (
          <p className="text-sm text-muted-foreground">No workspaces available yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {workspaces.map((w) => (
              <li key={w.name}>
                <AppCard entry={w} enabled={enabled} variant="workspace" />
              </li>
            ))}
          </ul>
        )
      }
      apps={showApps ? <AppsGrid apps={apps} enabled={enabled} /> : undefined}
    />
  );
}
