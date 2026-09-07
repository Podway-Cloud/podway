"use client";

import { useEffect } from "react";

/**
 * Keep the app shell's height matched to the REAL viewport.
 *
 * The shell is `h-dvh` with a single inner scroller. On iOS Safari `dvh` does not reliably
 * recompute when a page is restored from the back/forward cache or when you return to a tab that
 * has been backgrounded for a while — the shell keeps the height it had when the address bar was in
 * a different state. The result is a shell TALLER than the visible viewport: the top of the
 * scroller sits above the fold so you cannot scroll up to it, and dead space appears below the last
 * card. Reloading fixes it, which is exactly the shape of the owner's report (2026-09-07).
 *
 * So we publish the measured height as `--app-h` and let the shell prefer it, keeping `100dvh` as
 * the fallback for the first paint and for anyone without JS.
 *
 * `window.innerHeight`, NOT `visualViewport.height`: the visual viewport SHRINKS when the on-screen
 * keyboard opens, which would collapse the whole shell mid-typing. innerHeight tracks the browser
 * chrome without tracking the keyboard, which is the behaviour we want here.
 */
export function useAppHeight(): void {
  useEffect(() => {
    const apply = () => {
      document.documentElement.style.setProperty("--app-h", `${window.innerHeight}px`);
    };
    apply();
    // `pageshow` with persisted=true IS the bfcache restore — the case a plain resize listener
    // never sees, and the one the owner actually hit.
    const onPageShow = () => apply();
    const onVisible = () => {
      if (document.visibilityState === "visible") apply();
    };
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
