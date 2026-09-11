"use client";

import { useState, useEffect } from "react";
import posthog from "posthog-js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Boxes, SquarePlus, Settings, UserCheck, Users, ArrowLeft, Menu, HardDrive, Sparkles, ChartNoAxesCombined, Globe, Radio, TriangleAlert, CreditCard } from "lucide-react";
import UserMenu from "@/components/user-menu";
import { cn } from "@/lib/utils";
import { useAppHeight } from "@/lib/use-app-height";

/**
 * Icons live here (a client component) and are referenced by name, because a
 * Server Component layout can't pass a function/component across the boundary.
 * Add a nav icon here, then reference it by key from a layout's NavItem.
 */
const ICONS = { LayoutGrid, Boxes, SquarePlus, Settings, UserCheck, Users, ArrowLeft, HardDrive, Sparkles, ChartNoAxesCombined, Globe, Radio, TriangleAlert, CreditCard } as const;

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** Match the path exactly instead of by prefix (for index routes like /admin). */
  exact?: boolean;
  /** Draw a divider ABOVE this item — separates a group (e.g. Settings) from the rest. */
  sectionBreak?: boolean;
}

/**
 * Sidebar shell — desktop: a fixed left rail; mobile: a top bar with a
 * slide-in drawer. Nav only; account actions live in the bottom user menu.
 * The nav items and home link are passed in so both the user dashboard and the
 * backoffice render the same chrome with their own menus.
 */
export default function DashboardShell({
  userName,
  userId,
  supportIdentityHash,
  nav,
  homeHref = "/dashboard",
  children,
}: {
  userName: string;
  userId?: string;
  /** Server-computed HMAC of userId for PostHog Support verified-identity mode. Absent
   * until POSTHOG_SUPPORT_SECRET is set; the widget then runs unverified (per-browser). */
  supportIdentityHash?: string;
  nav: NavItem[];
  homeHref?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  // Re-fit the 100svh shell after a bfcache/tab-return (the frozen render iOS restores at a stale
  // height — the "dead band on a stale page"). No-op unless actually stale. See use-app-height.
  useAppHeight();

  // Keep a focused input ABOVE the on-screen keyboard on mobile. iOS Safari's native "scroll the
  // focused field into view" is unreliable inside our fixed shell's own scroller, so a tapped input
  // in the lower half could end up UNDER the keyboard (owner, 2026-09-11). After the keyboard has
  // animated in (~300ms), if the visual viewport has shrunk (keyboard open), scroll it to centre.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || typeof t.matches !== "function" || !t.matches("input, textarea, [contenteditable]")) return;
      window.setTimeout(() => {
        const vv = window.visualViewport;
        // Only when the keyboard is actually open (viewport notably shorter) and the field is still focused.
        if (!vv || vv.height >= window.innerHeight * 0.9 || document.activeElement !== t) return;
        t.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 300);
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  useEffect(() => {
    if (userId) {
      posthog.identify(userId, { name: userName });
      // Verified identity for PostHog Support — the hash proves this distinct_id so the
      // user's support tickets follow them across browsers/devices. The secret stays on
      // the server; only the hash reaches here. No-op until POSTHOG_SUPPORT_SECRET is set.
      if (supportIdentityHash) posthog.setIdentity(userId, supportIdentityHash);
    }
  }, [userId, userName, supportIdentityHash]);

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  const brand = (
    <Link
      className="inline-flex items-center gap-2.5"
      href={homeHref}
      onClick={() => setDrawer(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="block h-[30px] w-auto" src="/podway-mark.svg" alt="Podway" />
      <span className="text-xl font-bold tracking-tight">
        <span className="text-[var(--link-accent)]">pod</span>
        <span className="text-primary">way</span>
      </span>
    </Link>
  );

  const navMenu = (
    <nav className="flex flex-col gap-1">
      {nav.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(item);
        return (
          <div key={item.href} className={cn(item.sectionBreak && "mt-1 border-t border-border/60 pt-1")}>
            <Link
              href={item.href}
              data-testid="nav-link"
              aria-current={active ? "page" : undefined}
              onClick={() => setDrawer(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[15px] text-muted-foreground transition-colors hover:text-foreground",
                active && "bg-secondary font-medium text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0 opacity-70" aria-hidden />
              {item.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );

  return (
    // bg-background/text-foreground so the whole dashboard re-themes (the <body> keeps the legacy
    // --bg for the landing). Identical to the body in podway, so no visual change there.
    // Pinned to the viewport (position: fixed; top:0), overflow-hidden so the body never scrolls —
    // only <main> inside scrolls. Height is pure CSS `100svh` — the SMALL viewport height, a STATIC
    // value. Because the body never scrolls, iOS Safari's URL bar never auto-hides, so the visible
    // viewport stays at that small height permanently; svh matches it exactly and — being static —
    // cannot go stale after a bfcache/tab-return, which is the whole "dead band at the bottom" bug.
    // (`100dvh` here still went stale on the owner's iPhone; `--app-h` JS-measurement did too — svh
    // is the fix because it needs no recompute at all.)
    <div
      id="app-shell"
      className="fixed inset-x-0 top-0 flex h-[100svh] overflow-hidden bg-background text-foreground"
    >
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-[60px] items-center gap-3 border-b border-border bg-card px-3 md:hidden">
        <button
          className="grid size-10 place-items-center rounded-lg border border-border"
          aria-label="Menu"
          aria-expanded={drawer}
          onClick={() => setDrawer((d) => !d)}
        >
          <Menu className="size-4.5" />
        </button>
        {brand}
      </header>

      {/* Backdrop for the mobile drawer */}
      {drawer && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setDrawer(false)}
        />
      )}

      <aside
        data-testid="sidebar"
        data-drawer={drawer ? "open" : "closed"}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[264px] -translate-x-full flex-col border-r border-border bg-card p-4 transition-transform md:static md:translate-x-0",
          drawer && "translate-x-0",
        )}
      >
        <div className="px-2 py-2.5">{brand}</div>
        <div className="mt-4 flex-1">{navMenu}</div>
        <div className="border-t border-border pt-3">
          <UserMenu userName={userName} />
        </div>
      </aside>

      {/* The only scroll container; pages render into DashboardPage inside it. */}
      {/* Content is left-aligned (DashboardPage drops the mx-auto), with a comfortable gutter
          from the sidebar — 16px on a phone, 32px on desktop (owner wanted more air than the
          tight sidebar-rhythm value). */}
      {/* The top padding lives on the INNER wrapper, not on this scrollport. A sticky child measures
          its offset from the scrollport's CONTENT box, so padding-top here silently ADDS to every
          sticky `top` inside — the cockpit tab strip asked for 60px and landed at 136px (measured
          2026-09-07), leaving a 76px band where the page heading sat half-hidden behind it. */}
      <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-8 md:pt-7">
        <div className="pb-6 pt-[76px] md:pt-0">
        {children}
        </div>
      </main>
    </div>
  );
}
