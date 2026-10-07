import { POD_TIERS, type PodSize } from "@podway/shared/tiers";

/**
 * The self-host landing's app lineup — 12 apps we ACTUALLY run (each is a `kind: app` env in
 * environments/, visible in the catalog). `minSize` mirrors that env's podway.yaml `minSize` and is
 * guarded by test/selfhost-lineup.test.ts, so the starting price shown here matches the launch
 * wizard. Cards lead with the app's use; maintenance reports appear separately below.
 */
export interface LineupApp {
  slug: string; // the env name — also the /start?app= value
  name: string;
  logo: string;
  minSize: PodSize;
  benefit: string;
  replaces: string;
}

export const LINEUP: readonly LineupApp[] = [
  { slug: "n8n", name: "n8n", logo: "/selfhost-apps/n8n.svg", minSize: "s", benefit: "Connect your tools and automate recurring work.", replaces: "Zapier" },
  { slug: "ghost", name: "Ghost", logo: "/selfhost-apps/ghost.png", minSize: "mini", benefit: "Publish a site, newsletter and paid memberships.", replaces: "Substack" },
  { slug: "umami", name: "Umami", logo: "/selfhost-apps/umami.svg", minSize: "mini", benefit: "See website traffic with privacy-friendly analytics.", replaces: "Plausible" },
  { slug: "nocodb", name: "NocoDB", logo: "/selfhost-apps/nocodb.svg", minSize: "mini", benefit: "Work with your data in a collaborative spreadsheet.", replaces: "Airtable" },
  { slug: "twenty", name: "Twenty", logo: "/selfhost-apps/twenty.svg", minSize: "s", benefit: "Manage contacts, deals and customer work.", replaces: "Salesforce" },
  { slug: "listmonk", name: "Listmonk", logo: "/selfhost-apps/listmonk.svg", minSize: "mini", benefit: "Send newsletters and manage subscriber lists.", replaces: "Mailchimp" },
  { slug: "uptime-kuma", name: "Uptime Kuma", logo: "/selfhost-apps/uptime-kuma.svg", minSize: "mini", benefit: "Monitor your services and get outage alerts.", replaces: "Better Stack" },
  { slug: "vaultwarden", name: "Vaultwarden", logo: "/selfhost-apps/vaultwarden.svg", minSize: "mini", benefit: "Keep passwords and other credentials in a vault.", replaces: "Bitwarden Teams" },
  { slug: "metabase", name: "Metabase", logo: "/selfhost-apps/metabase.svg", minSize: "s", benefit: "Build dashboards and explore your data.", replaces: "Tableau" },
  { slug: "docmost", name: "Docmost", logo: "/selfhost-apps/docmost.svg", minSize: "s", benefit: "Write and share your team's documentation.", replaces: "Confluence" },
  { slug: "stirling-pdf", name: "Stirling-PDF", logo: "/selfhost-apps/stirling-pdf.svg", minSize: "s", benefit: "Edit, convert and organize PDFs.", replaces: "Adobe Acrobat Pro" },
  { slug: "actual-budget", name: "Actual Budget", logo: "/selfhost-apps/actual-budget.svg", minSize: "mini", benefit: "Track spending and plan a budget.", replaces: "YNAB" },
];

export function appPriceUsd(app: Pick<LineupApp, "minSize">): number {
  return POD_TIERS[app.minSize].monthlyUsd;
}

/** "The tax on self-hosting" — verbatim, linked public reports (checked 2026-10-06). */
export const MAINTENANCE_REPORTS = [
  {
    quote: "Many of my workflows stopped running on May 22nd (after upgrading to version 2.21.7).",
    source: "github.com/n8n-io/n8n #31100",
    href: "https://github.com/n8n-io/n8n/issues/31100",
  },
  {
    quote: "Can't upgrade 6.26 to 6.27 or later because of a migration foreign key fail",
    source: "github.com/TryGhost/Ghost #27652",
    href: "https://github.com/TryGhost/Ghost/issues/27652",
  },
  {
    quote: "3.3.0 update causes invalid … errors, will not start",
    source: "github.com/umami-software/umami #4458",
    href: "https://github.com/umami-software/umami/issues/4458",
  },
  {
    quote: "After upgrading to v4 the containers fail to start.",
    source: "github.com/knadh/listmonk #2112",
    href: "https://github.com/knadh/listmonk/issues/2112",
  },
] as const;
