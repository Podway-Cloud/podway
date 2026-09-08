import Link from "next/link";
import { Plus } from "lucide-react";
import DashboardShell, { type NavItem } from "@/components/dashboard-shell";
import DashboardPage from "@/components/dashboard-page";
import PodCardList from "@/components/pod-card-list";
import SlotMeter from "@/components/slot-meter";
import { Button } from "@/components/ui/button";
import type { PodCardProps } from "@/components/pod-card";
import type { PodCardLive } from "@/lib/pod-visual-state";

/**
 * DEV-ONLY. Renders the dashboard with MOCK pods in varied states so the landing hero
 * (docs/images/dashboard.png) can be re-shot with demo — not real — pods. Not linked
 * anywhere; returns null in production.
 */
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Pods", icon: "LayoutGrid", exact: true },
  { href: "/dashboard/create", label: "Create a pod", icon: "SquarePlus" },
  { href: "/dashboard/settings", label: "Settings", icon: "Settings", sectionBreak: true },
];

const T = Date.now();
const claude = { id: "claude-code", authed: true };
const codex = { id: "codex", authed: true };
const base = (agentStatus: string | null, extra: Partial<PodCardLive> = {}): PodCardLive => ({
  status: "running",
  agentStatus,
  agentWaitingFor: null,
  codexStatus: "idle",
  agents: [claude, codex],
  appListening: false,
  criticalIssue: null,
  unreachable: false,
  ...extra,
});

const CARDS: PodCardProps[] = [
  {
    slug: "acme-storefront", name: "acme storefront", environmentTitle: "Next.js commerce",
    status: "running", agoLabel: "just now", previewPublic: true,
    previewUrl: "https://acme-storefront.preview.podway.app",
    authedAt: new Date(T - 3_600_000).toISOString(), sessionUrl: "https://claude.ai/code/session_d1",
    podAgents: ["claude-code", "codex"],
    codexDevices: [{ name: "MacBook Pro", at: "" }, { name: "iPhone", at: "" }],
    live: base("busy", { agentIdleMs: 0, appListening: true }),
  },
  {
    slug: "weekly-digest", name: "weekly digest", environmentTitle: "Reporting bot",
    status: "running", agoLabel: "just now", previewPublic: false, previewUrl: null,
    authedAt: new Date(T - 7_200_000).toISOString(), sessionUrl: "https://claude.ai/code/session_d2",
    podAgents: ["claude-code", "codex"], codexDevices: [{ name: "Studio", at: "" }],
    live: base("waiting", { agentWaitingFor: "your reply" }),
  },
  {
    slug: "landing-redesign", name: "landing redesign", environmentTitle: "Marketing site",
    status: "running", agoLabel: "18m ago", previewPublic: false,
    previewUrl: "https://landing-redesign.preview.podway.app",
    authedAt: new Date(T - 3_600_000).toISOString(), sessionUrl: "https://claude.ai/code/session_d4",
    updateReady: true, podAgents: ["claude-code"], codexDevices: [],
    live: base("idle", { agents: [claude], codexStatus: null, appListening: true }),
  },
  {
    slug: "support-triage", name: "support triage", environmentTitle: "Ops automation",
    status: "running", agoLabel: "2m ago", previewPublic: false, previewUrl: null,
    authedAt: new Date(T - 9_000_000).toISOString(), sessionUrl: "https://claude.ai/code/session_d3",
    updating: true, podAgents: ["claude-code"], codexDevices: [],
    live: base("idle", { updating: true, agents: [claude], codexStatus: null, appListening: null }),
  },
  {
    slug: "invoice-parser", name: "invoice parser", environmentTitle: "First customers",
    status: "running", agoLabel: "1h ago", previewPublic: false, previewUrl: null,
    authedAt: new Date(T - 5_400_000).toISOString(), sessionUrl: "https://claude.ai/code/session_d5",
    podAgents: ["claude-code", "codex"], codexDevices: [],
    live: base("idle"),
  },
];

export default function DashboardHeroHarness() {
  if (process.env.NODE_ENV === "production") return null;
  return (
    <DashboardShell userName="Alex Morgan" userId="demo" nav={NAV}>
      <DashboardPage
        roomy
        title="Your pods"
        actions={
          <Button asChild variant="outline" size="sm" className="h-10 sm:h-8">
            <Link href="/dashboard/create">
              <Plus className="size-4" />
              New pod
            </Link>
          </Button>
        }
      >
        <SlotMeter used={5} cap={8} unlimited={false} />
        <section>
          <PodCardList cards={CARDS} bulkUpdate />
        </section>
      </DashboardPage>
    </DashboardShell>
  );
}
