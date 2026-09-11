"use client";

import { useEffect } from "react";

/**
 * Keep the app shell matched to the REAL VISIBLE viewport — the area not covered by the browser
 * chrome OR the on-screen keyboard.
 *
 * The shell is `position:fixed; top:0; height:var(--app-h,100dvh)` with a single inner scroller. Two
 * mobile-Safari problems both come from the shell not tracking the visible area:
 *   1. Returning to a backgrounded tab (or a bfcache restore) leaves the shell TALLER than the
 *      viewport — the top sits above the fold (can't scroll to it) and dead space appears below the
 *      last card (owner report 2026-09-07/09).
 *   2. Opening the keyboard to type (e.g. a secret's name/value) leaves the full-height shell behind
 *      the keyboard, so a short page shows a dead band between the content and the keyboard (owner
 *      report 2026-09-11, with a screenshot).
 *
 * The fix is the one the pod terminal already uses (pod-terminal.tsx) and which never had this bug:
 * drive the shell from `window.visualViewport` — its `height` shrinks for BOTH the address bar and
 * the keyboard, and its `offsetTop` is how far the visual viewport has been pushed down. We publish
 * both as CSS vars: `--app-h` (height) and `--app-top` (the translateY the shell applies), so the
 * fixed shell exactly overlays the visible area and follows it when the keyboard opens. Falls back to
 * `innerHeight` / `0` where `visualViewport` is unavailable.
 *
 * (The earlier version deliberately used `innerHeight` to avoid the shell "collapsing" when the
 * keyboard opened — but shrinking to the visible area is exactly what we want: the focused input then
 * scrolls above the keyboard instead of being buried under a too-tall shell. The terminal proves it.)
 *
 * Timing note kept from before: on iOS the settled value can land a few hundred ms after a return, and
 * a plain tab-switch doesn't always emit pageshow/resize — so we re-measure on the next frame + a
 * couple of short delays, and listen broadly (pageshow, focus, visibility, visualViewport). We only
 * WRITE when a value actually changed, so the repeats are no-ops once settled.
 */
export function useAppHeight(): void {
  useEffect(() => {
    let lastH = -1;
    let lastTop = -1;
    const measure = () => {
      const vv = window.visualViewport;
      const h = vv ? Math.round(vv.height) : window.innerHeight;
      const top = vv ? Math.round(vv.offsetTop) : 0;
      const root = document.documentElement.style;
      if (h > 0 && h !== lastH) {
        lastH = h;
        root.setProperty("--app-h", `${h}px`);
      }
      if (top !== lastTop) {
        lastTop = top;
        root.setProperty("--app-top", `${top}px`);
      }
    };
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
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", settle);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", settle);
    document.addEventListener("visibilitychange", onVisible);
    // The pair that tracks the iOS address bar AND the keyboard: height + offsetTop.
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
