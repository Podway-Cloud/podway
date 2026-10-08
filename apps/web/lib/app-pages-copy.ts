/**
 * Per-app copy for the /apps/<slug> hosting pages (GTM template, 2026-10-07). `oneLiner` is what the app
 * does for the visitor; `replaces` is the paid product it stands in for. The first 12 are the GTM pod's
 * own copy (= the /selfhost lineup); the rest were drafted by podway dev and sent to GTM for review.
 * Price is NOT here — it comes from the env's minSize (apps/web/lib/app-catalog.ts appPriceUsd), so a
 * page can never advertise a price the wizard won't charge. Guarded by test/app-pages.test.ts.
 */
export interface AppPageCopy {
  oneLiner: string;
  replaces: string;
}

export const APP_PAGE_COPY: Record<string, AppPageCopy> = {
  // GTM pod (the live /selfhost lineup)
  n8n: { oneLiner: "Connect your tools and automate recurring work.", replaces: "Zapier" },
  ghost: { oneLiner: "Publish a site, newsletter and paid memberships.", replaces: "Substack" },
  umami: { oneLiner: "See website traffic with privacy-friendly analytics.", replaces: "Plausible" },
  nocodb: { oneLiner: "Work with your data in a collaborative spreadsheet.", replaces: "Airtable" },
  twenty: { oneLiner: "Manage contacts, deals and customer work.", replaces: "Salesforce" },
  listmonk: { oneLiner: "Send newsletters and manage subscriber lists.", replaces: "Mailchimp" },
  "uptime-kuma": { oneLiner: "Monitor your services and get outage alerts.", replaces: "Better Stack" },
  vaultwarden: { oneLiner: "Keep passwords and other credentials in a vault.", replaces: "Bitwarden Teams" },
  metabase: { oneLiner: "Build dashboards and explore your data.", replaces: "Tableau" },
  docmost: { oneLiner: "Write and share your team's documentation.", replaces: "Confluence" },
  "stirling-pdf": { oneLiner: "Edit, convert and organize PDFs.", replaces: "Adobe Acrobat Pro" },
  "actual-budget": { oneLiner: "Track spending and plan a budget.", replaces: "YNAB" },
  // podway dev drafts (reviewed by GTM 2026-10-07)
  changedetection: { oneLiner: "Get an alert when a web page changes.", replaces: "Visualping" },
  documenso: { oneLiner: "Send documents for e-signature.", replaces: "DocuSign" },
  freshrss: { oneLiner: "Follow blogs and news in one reader.", replaces: "Feedly" },
  gatus: { oneLiner: "Health checks and a status page for your services.", replaces: "Pingdom" },
  gitea: { oneLiner: "Host your Git repositories, issues and pull requests.", replaces: "GitHub Team" },
  glance: { oneLiner: "One start page for your feeds, services and links.", replaces: "Start.me" },
  grafana: { oneLiner: "Graphs and dashboards for your metrics.", replaces: "Datadog dashboards" },
  meilisearch: { oneLiner: "Fast, typo-tolerant search for your site or app.", replaces: "Algolia" },
  memos: { oneLiner: "Capture notes and ideas in a private timeline.", replaces: "Google Keep" },
  ntfy: { oneLiner: "Send push notifications to your phone.", replaces: "Pushover" },
  outline: { oneLiner: "A fast wiki and knowledge base for your team.", replaces: "Notion" },
  paca: { oneLiner: "An AI-native Scrum board where your agents are teammates.", replaces: "Jira" },
  "paperless-ngx": { oneLiner: "Scan, tag and search your paper documents.", replaces: "Evernote" },
  postiz: { oneLiner: "Schedule social media posts across your channels.", replaces: "Buffer" },
  rallly: { oneLiner: "Find a meeting time that works for everyone.", replaces: "Doodle" },
  searxng: { oneLiner: "Private search across many search engines.", replaces: "Kagi" },
};
