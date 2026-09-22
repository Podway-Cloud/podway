"use client";

import { useEffect, useRef } from "react";
import AppCard, { type CardEntry } from "@/components/app-card";

const SCROLL_KEY = "catalog-apps-scroll-y";

/** The nearest scrollable ancestor of `from` (the dashboard shell scrolls an inner <main>, not the
 * window), or `window` if none. */
function scrollContainer(from: HTMLElement | null): HTMLElement | Window {
  let node: HTMLElement | null = from?.parentElement ?? null;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return window;
}
function getScrollTop(c: HTMLElement | Window): number {
  return c === window ? window.scrollY : (c as HTMLElement).scrollTop;
}
function setScrollTop(c: HTMLElement | Window, y: number): void {
  if (c === window) window.scrollTo(0, y);
  else (c as HTMLElement).scrollTop = y;
}

/**
 * The Apps tab grid: apps arrive already SORTED BY GITHUB STARS (desc) from the server. No tag filter
 * row (owner call). On card click we save the scroll position, and restore it on mount, so returning
 * from a launch (browser Back) lands at the same place in the grid instead of the top.
 */
export default function AppsGrid({ apps, enabled }: { apps: CardEntry[]; enabled: boolean }) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    let y: number | null = null;
    try {
      const s = sessionStorage.getItem(SCROLL_KEY);
      if (s) {
        y = parseInt(s, 10);
        sessionStorage.removeItem(SCROLL_KEY);
      }
    } catch {
      /* sessionStorage may be unavailable — ignore */
    }
    if (y != null && !Number.isNaN(y) && y > 0) {
      // After paint (twice), so the grid has laid out to full height before we restore.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setScrollTop(scrollContainer(ref.current), y as number)),
      );
    }
  }, []);

  const saveScroll = () => {
    try {
      sessionStorage.setItem(SCROLL_KEY, String(getScrollTop(scrollContainer(ref.current))));
    } catch {
      /* ignore */
    }
  };

  if (apps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No apps available yet — self-hosted OSS apps Podway deploys and keeps up to date for you.
      </p>
    );
  }
  return (
    // Width-AWARE columns: fit as many cards as hold a ~320px minimum, dropping to fewer when the
    // available space shrinks (the dashboard content area is narrower than the viewport when a side
    // panel is open). `min(100%, …)` keeps a single column from overflowing on a phone. This replaces
    // fixed sm/lg breakpoints, which ignored the real container width and kept cropping card text.
    <ul
      ref={ref}
      onClickCapture={saveScroll}
      className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4"
    >
      {apps.map((a) => (
        <li key={a.name}>
          <AppCard entry={a} enabled={enabled} variant="app" />
        </li>
      ))}
    </ul>
  );
}
