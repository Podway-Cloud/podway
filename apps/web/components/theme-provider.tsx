"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * App theme provider (Phase 1 of the theming initiative).
 *
 * Sets `data-theme` on <html> so the CSS token layer in globals.css can be
 * overridden per theme. Today only ONE theme exists — "podway", the current
 * navy-dark look, which is exactly what the base `:root` in globals.css already
 * renders — so this is intentionally a ZERO visual change: it just names the
 * current look and lays the plumbing for the neutral `dark` and `light` themes
 * (added in later phases) plus a user-facing switcher.
 *
 * Three themes: "podway" (the default navy dark), "dark" (neutral), "light". The
 * dashboard re-themes; the marketing landing stays podway by design (it keeps the
 * legacy landing vars, which these themes don't touch). enableSystem stays OFF —
 * podway is a deliberate default, not "whatever the OS is".
 */
export const THEMES = ["podway", "dark", "light"] as const;
export const THEME_LABELS: Record<(typeof THEMES)[number], string> = {
  podway: "Podway",
  dark: "Dark",
  light: "Light",
};

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="podway"
      themes={[...THEMES]}
      enableSystem={false}
      disableTransitionOnChange
      storageKey="podway-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
