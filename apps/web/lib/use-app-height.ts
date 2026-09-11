"use client";

import { useEffect } from "react";

/**
 * The shell is CSS `height: 100svh` (static). That fixes the LIVE case, but NOT the one the owner keeps
 * hitting: returning to a tab that iOS Safari froze in the back/forward cache. A bfcache restore replays
 * the RENDERED layout at its frozen pixel height — so no viewport unit (svh/dvh) helps; the frozen height
 * simply doesn't match the current viewport, leaving the "dead band at the bottom of a stale page." The
 * owner confirmed a manual REFRESH always fixes it.
 *
 * So on a restore/return, if `#app-shell` has drifted from the real viewport height, we RE-FIT: force a
 * reflow (pin to the live `innerHeight`, then release back to the `100svh` class). If it is STILL stale a
 * moment later, the render is genuinely frozen and only a reload cures it (owner-confirmed) — so we do
 * exactly the refresh they'd do by hand, but ONLY when actually stuck (never on a fresh return, never on
 * desktop, where the height already matches).
 */
export function useAppHeight(): void {
  useEffect(() => {
    const shell = () => document.getElementById("app-shell");
    // > 40px drift = a real stale mismatch, not sub-pixel rounding.
    const stale = (el: HTMLElement) => Math.abs(el.getBoundingClientRect().height - window.innerHeight) > 40;

    const refit = () => {
      const el = shell();
      if (!el || !stale(el)) return;
      el.style.height = `${window.innerHeight}px`; // pin to the live viewport (correct after settle)
      requestAnimationFrame(() => {
        const el2 = shell();
        if (!el2) return;
        el2.style.height = ""; // release back to the class's 100svh, now freshly laid out
        window.setTimeout(() => {
          const el3 = shell();
          if (el3 && stale(el3)) window.location.reload(); // frozen render → the refresh that works
        }, 250);
      });
    };
    // iOS reports a stale innerHeight at event time, so settle before measuring.
    const settleThenRefit = () => {
      window.setTimeout(refit, 100);
      window.setTimeout(refit, 400);
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) settleThenRefit(); // bfcache restore
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") settleThenRefit(); // returned to a backgrounded tab
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
