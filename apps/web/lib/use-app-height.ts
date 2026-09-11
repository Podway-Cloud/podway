"use client";

import { useEffect } from "react";

/**
 * The dashboard shell is sized with pure CSS `height: 100dvh` (the DYNAMIC viewport height — iOS
 * Safari resizes it natively as the address bar shows/hides, so the normal case needs NO JavaScript).
 *
 * This hook covers the ONE case CSS misses: after a back/forward-cache restore, or returning to a tab
 * that was backgrounded a while, iOS Safari does not always re-evaluate `dvh` — the shell keeps a
 * height from when the address bar was in a different state, taller than the viewport, leaving the
 * "dead band at the bottom of a stale page" (owner report, repeatedly through 2026-09). We force a
 * re-layout: briefly override the shell's height to a STABLE `100svh`, then clear it back to the
 * `100dvh` class on the next frames, which makes Safari recompute the unit with fresh metrics.
 *
 * This REPLACES the previous JS-computed `--app-h` / `--app-top` system, which itself kept going stale
 * (chasing the measurement it could never keep fresh) and — via a `translateY` transform — suppressed
 * iOS's native scroll-into-view so a focused input hid under the keyboard. CSS-first is the fix; this
 * is just the nudge for the bfcache edge.
 */
export function useAppHeight(): void {
  useEffect(() => {
    const shell = () => document.getElementById("app-shell");
    const nudge = () => {
      const el = shell();
      if (!el) return;
      el.style.height = "100svh"; // a stable, different value → forces a reflow
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const again = shell();
          if (again) again.style.height = ""; // back to the class's 100dvh, freshly recomputed
        }),
      );
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) nudge(); // bfcache restore
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") nudge(); // returned to a backgrounded tab
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
