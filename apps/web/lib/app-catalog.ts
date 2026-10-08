import "server-only";

import { POD_TIERS } from "@podway/shared/tiers";
import { listEnvironments, type CatalogEntry } from "./environments";

/** Apps committed + baked but NOT offered (catalog, /apps pages, landing lineup). One list for all. */
export const HIDDEN_APPS = new Set([
  "excalidraw",
  "code-server",
  "it-tools",
  "filebrowser",
  "homepage",
  "wikijs",
  // Not owner-curation: firefly-iii is committed + baked but fails restart-survival on a
  // hard pod reboot (storage-perms corruption). Hidden until fixed + re-smoked. See 0audit.md.
  "firefly-iii",
]);

/** The apps a visitor can launch, A–Z by title. */
export async function listPublicApps(): Promise<CatalogEntry[]> {
  return (await listEnvironments())
    .filter((e) => e.kind === "app" && !HIDDEN_APPS.has(e.name))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}

/** Monthly price of an app's smallest size (what the wizard charges by default). */
export function appPriceUsd(entry: Pick<CatalogEntry, "minSize">): number {
  return POD_TIERS[entry.minSize ?? "mini"].monthlyUsd;
}
