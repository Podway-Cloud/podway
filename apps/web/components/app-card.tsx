"use client";

import Link from "next/link";
import Image from "next/image";
import { Code2, FolderGit2 } from "lucide-react";
import type { CatalogEntry } from "@/lib/environments";
import { categoriesFor, formatStars, formatUpdated } from "@/lib/catalog-tags";
// Import from the `./tiers` subpath, NOT the package root: the root barrel pulls in server-only
// modules (node:fs) and breaks the client bundle. tiers.ts is pure/client-safe.
import { priceForSize, DEFAULT_POD_SIZE } from "@podway/shared/tiers";

export type CardEntry = CatalogEntry & { stars: number | null; updatedAt: string | null };

// GitHub mark — lucide dropped its brand icons, so a repo link needs this small inline glyph.
function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 012-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
function StarGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 1.2l2.09 4.24 4.68.68-3.38 3.3.8 4.66L8 11.9l-4.19 2.2.8-4.66-3.38-3.3 4.68-.68z" />
    </svg>
  );
}
function TagGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden className={className}>
      <path d="M2 2h5.2L14 8.8 8.8 14 2 7.2z" strokeLinejoin="round" />
      <circle cx="4.6" cy="4.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * A single catalog card (selfh.st layout): big logo left, name + one-line description, a divider, then
 * a footer with ★ stars → GitHub, last-updated, and category. The WHOLE card is the launch target (a
 * stretched-link overlay); the name links to the app's site and the ★ link goes to GitHub — both lifted
 * above the overlay. Presentational + client so the grid can sort/filter without a server round-trip.
 */
export default function AppCard({
  entry: e,
  enabled,
  variant,
}: {
  entry: CardEntry;
  enabled: boolean;
  variant: "workspace" | "app";
}) {
  const isApp = variant === "app";
  const categories = categoriesFor(e, variant);
  const TileIcon = e.name === "byo-project" ? FolderGit2 : Code2;
  const href = `/dashboard/pods/new?env=${encodeURIComponent(e.name)}`;
  const updated = e.updatedAt ? formatUpdated(e.updatedAt) : "";
  // Monthly cost of the smallest pod this app runs on (the launch floors to minSize).
  const cost = priceForSize(e.minSize ?? DEFAULT_POD_SIZE);
  return (
    // A div, not an anchor: the launch link is an absolute OVERLAY (a positioned sibling) so the whole
    // card taps to launch, while the name→site and ★→GitHub links sit above it (relative z-10) and stay
    // independently clickable. Nesting anchors would be invalid HTML — hence the overlay pattern.
    <div
      className={
        "group relative flex h-full flex-col gap-4 overflow-hidden rounded-xl border border-border bg-[var(--fill-strong)]/30 p-5 transition-colors " +
        (enabled ? "hover:border-[var(--link-accent)]/60 focus-within:border-[var(--link-accent)]/60" : "opacity-70")
      }
    >
      {enabled && (
        <Link href={href} aria-label={`Launch ${e.title}`} className="absolute inset-0" />
      )}
      {/* HEADER: big logo left, name + one-line description right (selfh.st layout). */}
      <div className="flex items-start gap-4">
        {isApp ? (
          <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-border">
            <Image
              src={`/selfhost-apps/${e.logo ?? `${e.name}.svg`}`}
              alt=""
              width={34}
              height={34}
              className="size-[34px] object-contain"
            />
          </span>
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[var(--link-accent)] text-[var(--fill-strong)]" aria-hidden>
            <TileIcon className="size-7" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-semibold leading-tight">
            {e.siteUrl ? (
              <a
                href={e.siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(ev) => ev.stopPropagation()}
                className="relative z-10 hover:text-[var(--link-accent)] hover:underline"
              >
                {e.title}
              </a>
            ) : (
              e.title
            )}
          </h3>
          {e.description && (
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground">{e.description}</p>
          )}
        </div>
      </div>

      {/* FOOTER: divider, then ★stars · updated · category on the left, and the monthly cost pushed
          to the bottom-right (from the app's minSize tier). */}
      {(e.stars != null || updated || isApp || (!isApp && categories.length > 0)) && (
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          {e.sourceUrl && e.stars != null && (
            <a
              href={e.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(ev) => ev.stopPropagation()}
              className="relative z-10 inline-flex items-center gap-1.5 hover:text-foreground"
              title={`${e.stars.toLocaleString()} GitHub stars`}
            >
              <GithubMark className="size-3.5 shrink-0" />
              <StarGlyph className="size-3 text-warning" />
              {formatStars(e.stars)}
            </a>
          )}
          {updated && (
            <span className="inline-flex items-center gap-1.5" title="Last updated on GitHub">
              <span className="size-1.5 rounded-full bg-success" aria-hidden />
              Updated {updated}
            </span>
          )}
          {/* App cards hide the category line (owner call) — the tag FILTER chips above still use them;
              workspaces keep it. */}
          {!isApp && categories.length > 0 && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <TagGlyph className="size-3.5 shrink-0" />
              <span className="truncate">{categories.join(" · ")}</span>
            </span>
          )}
          {isApp && (
            <span
              className="ml-auto shrink-0 font-medium text-foreground"
              title="Runs on the smallest pod that fits this app; billed while it runs"
            >
              from ${cost}/mo
            </span>
          )}
        </div>
      )}
    </div>
  );
}
