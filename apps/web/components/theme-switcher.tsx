"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Check } from "lucide-react";
import { THEMES, THEME_LABELS } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

/**
 * Appearance control — pick podway / dark / light. A segmented control rather than a
 * dropdown so all three are visible at once (there are only three). next-themes persists
 * the choice (localStorage) and stamps data-theme on <html>; the swatch dot previews each.
 */
// Evocative, DISTINCT swatches — podway's navy and dark's near-black both read as
// plain black at 12px, so represent each by its signature instead: podway = its blue,
// dark = a neutral grey, light = white.
const SWATCH: Record<(typeof THEMES)[number], string> = {
  podway: "#2f6bff",
  dark: "#52525b",
  light: "#ffffff",
};

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  // next-themes resolves the active theme only after mount; render a neutral state first
  // to avoid a hydration mismatch (server has no theme knowledge).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const active = mounted ? theme : undefined;

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-1 p-1"
    >
      {THEMES.map((t) => {
        const selected = active === t;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(t)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
              selected
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-surface-3 hover:text-foreground",
            )}
          >
            <span
              className="size-3 shrink-0 rounded-full border border-border"
              style={{ background: SWATCH[t] }}
              aria-hidden
            />
            {THEME_LABELS[t]}
            {selected && <Check className="size-3 shrink-0" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
