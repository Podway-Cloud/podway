import DashboardShell, { type NavItem } from "@/components/dashboard-shell";
import DashboardPage from "@/components/dashboard-page";
import ExperimentsPanel from "@/components/experiments-panel";
import type { LandingPanelData } from "@/lib/landing-experiment-store";

/**
 * DEV-ONLY. Renders the landing-experiments panel with MOCK data (a running A/B test with a
 * clear winner) so the four-zone layout can be screenshotted without a DB or admin login.
 * Uses the REAL panel + client controls. Not linked anywhere; returns null in production.
 */
const NAV: NavItem[] = [
  { href: "/admin", label: "Access requests", icon: "UserCheck", exact: true },
  { href: "/admin/experiments", label: "Experiments", icon: "ChartNoAxesCombined" },
];

const MOCK: LandingPanelData = {
  experimentId: "landing-agent-computer-2026-08-real-home-cloud",
  label: "Landing: real home + cloud VM",
  status: "active",
  deliveryMode: "measured",
  pinnedVariant: "outcomes",
  fallbackVariant: "outcomes",
  servedVariant: "outcomes",
  variants: ["outcomes", "agent-computer", "agent-home"],
  allocation: { outcomes: 34, "agent-computer": 33, "agent-home": 33 },
  primaryMetric: "signin_completed",
  totalVisitors: 15_350,
  rows: [
    { variant: "outcomes", visitors: 5200, conversions: 468, isControl: true, isDefault: true },
    { variant: "agent-computer", visitors: 5100, conversions: 612, isControl: false, isDefault: false },
    { variant: "agent-home", visitors: 5050, conversions: 505, isControl: false, isDefault: false },
  ],
};

export default function ExperimentsPanelHarness() {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <DashboardShell userName="Alex Morgan" userId="demo" nav={NAV} homeHref="/admin">
      <DashboardPage
        title="Landing experiments"
        intro="Choose what serves /, run the A/B test, and promote a winner."
        wide
        actions={
          <span className="inline-flex items-center rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10.5px] font-medium text-success">
            Running
          </span>
        }
      >
        <ExperimentsPanel data={MOCK} />
      </DashboardPage>
    </DashboardShell>
  );
}
