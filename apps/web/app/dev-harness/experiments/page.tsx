import DashboardShell, { type NavItem } from "@/components/dashboard-shell";
import DashboardPage from "@/components/dashboard-page";
import ExperimentsPanel from "@/components/experiments-panel";
import { ACTIVE_LANDING_EXPERIMENT } from "@/lib/landing-experiment-config";
import type { HomepageTraffic } from "@/lib/homepage-traffic";
import type { ChangeLogEntry, PeriodResult } from "@/lib/homepage-traffic-report";

/**
 * DEV-ONLY. Renders the homepage traffic panel with MOCK data (a 50/50 split, one earlier period)
 * so it can be screenshotted without a DB or admin login. Uses the REAL panel + client control
 * (Save would fail here — there is no DB). Not linked anywhere; returns null in production.
 */
const NAV: NavItem[] = [
  { href: "/admin", label: "Access requests", icon: "UserCheck", exact: true },
  { href: "/admin/experiments", label: "Experiments", icon: "ChartNoAxesCombined" },
];

const P2 = new Date("2026-10-06T12:40:00Z");
const TRAFFIC: HomepageTraffic = {
  mode: "split",
  weights: { "agent-computer": 50, selfhost: 50 },
  one: null,
  period: 2,
  periodStartedAt: P2,
};
const RESULTS: PeriodResult[] = [
  {
    period: 2,
    start: P2,
    end: null,
    weights: { "agent-computer": 50, selfhost: 50 },
    rows: [
      { variant: "agent-computer", visitors: 1204, signups: 31, pods: 9 },
      { variant: "selfhost", visitors: 1188, signups: 44, pods: 15 },
    ],
  },
  {
    period: 1,
    start: new Date("2026-10-05T09:10:00Z"),
    end: P2,
    weights: { "agent-computer": 100, selfhost: 0 },
    rows: [
      { variant: "agent-computer", visitors: 402, signups: 9, pods: 3 },
      { variant: "selfhost", visitors: 0, signups: 0, pods: 0 },
    ],
  },
];
const LOG: ChangeLogEntry[] = [
  { at: P2, who: "Alex Morgan", what: "Split 50% Agent computer · 50% Self-host — new results period" },
  { at: new Date("2026-10-05T09:10:00Z"), who: "Alex Morgan", what: "Only Agent computer — split paused" },
];

export default function ExperimentsPanelHarness() {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <DashboardShell userName="Alex Morgan" userId="demo" nav={NAV} homeHref="/admin">
      <DashboardPage title="Homepage landing" intro="What visitors see at podway.io, and how each landing converts." wide>
        <ExperimentsPanel definition={ACTIVE_LANDING_EXPERIMENT} traffic={TRAFFIC} results={RESULTS} log={LOG} />
      </DashboardPage>
    </DashboardShell>
  );
}
