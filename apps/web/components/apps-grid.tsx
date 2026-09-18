"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import AppCard, { type CardEntry } from "@/components/app-card";
import { displayTagsFor } from "@/lib/catalog-tags";

/**
 * The Apps tab grid: apps arrive already SORTED BY GITHUB STARS (desc) from the server, and this client
 * component adds clickable category-tag FILTERING on top. Clicking a tag narrows the grid; clicking it
 * again (or "All") clears it.
 */
export default function AppsGrid({ apps, enabled }: { apps: CardEntry[]; enabled: boolean }) {
  const [active, setActive] = useState<string | null>(null);
  if (apps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No apps available yet — self-hosted OSS apps Podway deploys and keeps up to date for you.
      </p>
    );
  }
  // Unique category tags across all apps, for the filter row.
  const allTags = Array.from(new Set(apps.flatMap((a) => displayTagsFor(a, "app")))).sort();
  const shown = active ? apps.filter((a) => displayTagsFor(a, "app").includes(active)) : apps;
  return (
    <div className="flex flex-col gap-4">
      {allTags.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <FilterChip label="All" active={active === null} onClick={() => setActive(null)} />
          {allTags.map((t) => (
            <FilterChip
              key={t}
              label={t}
              active={active === t}
              onClick={() => setActive(active === t ? null : t)}
            />
          ))}
        </div>
      )}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {shown.map((a) => (
          <li key={a.name}>
            <AppCard entry={a} enabled={enabled} variant="app" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-[var(--link-accent)]/50 bg-[var(--link-accent)]/10 text-foreground"
          : "border-border text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
