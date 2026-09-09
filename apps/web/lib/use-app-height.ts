"use client";

import { useEffect } from "react";

/**
 * Keep the app shell's height matched to the REAL viewport.
 *
 * The shell is `h-[var(--app-h,100dvh)]` with a single inner scroller. On iOS Safari `dvh` does not
 * reliably recompute when a page is restored from the back/forward cache or when you return to a tab
 * that has been backgrounded for a while — the shell keeps the height it had when the address bar was
 * in a different state. The result is a shell TALLER than the visible viewport: the top of the
 * scroller sits above the fold so you cannot scroll up to it, and dead space appears below the last
 * card. Reloading fixes it, which is exactly the shape of the owner's report (2026-09-07, still seen
 * 2026-09-09).
 *
 * Two things make the naive "set --app-h on pageshow/visibilitychange" version miss the case:
 *   1. TIMING. When those events fire on iOS, `window.innerHeight` is often STILL the stale value —
 *      the address bar animation hasn't settled, so reading it synchronously re-publishes the wrong
 *      height. So we re-measure on the next frame AND again after a couple of short delays, catching
 *      the settled value whenever it lands.
 *   2. COVERAGE. A plain tab-switch return doesn't always emit pageshow, and sometimes not resize
 *      either. So we also listen on `focus` and on `visualViewport` resize/scroll — between them,
 *      something fires on every return path.
 *
 * `window.innerHeight`, NOT `visualViewport.height`: the visual viewport SHRINKS when the on-screen
 * keyboard opens, which would collapse the whole shell mid-typing. innerHeight tracks the browser
 * chrome without tracking the keyboard, which is the behaviour we want here. We only WRITE when the
 * value actually changed, so the repeated re-measures are no-ops (no reflow) once it has settled.
 */
export function useAppHeight(): void {
  useEffect(() => {
    let last = -1;
    const measure = () => {
      const h = window.innerHeight;
      if (h > 0 && h !== last) {
        last = h;
        document.documentElement.style.setProperty("--app-h", `${h}px`);
      }
    };
    // Measure now, on the next frame (after layout settles), and again a couple of times — iOS can
    // report the settled innerHeight anywhere in the first few hundred ms after a return.
    const timers: number[] = [];
    const settle = () => {
      measure();
      requestAnimationFrame(measure);
      timers.push(window.setTimeout(measure, 120));
      timers.push(window.setTimeout(measure, 360));
    };

    settle();

    const onPageShow = () => settle();
    const onVisible = () => {
      if (document.visibilityState === "visible") settle();
    };
    // resize/orientationchange fire during and after the address-bar animation — measure immediately
    // (no need to re-settle) since these already reflect a real dimension change.
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", settle);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", settle);
    document.addEventListener("visibilitychange", onVisible);
    // The one that most reliably tracks the iOS address bar showing/hiding.
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", settle);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", settle);
      document.removeEventListener("visibilitychange", onVisible);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, []);
}
