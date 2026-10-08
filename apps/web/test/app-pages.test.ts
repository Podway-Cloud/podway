import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { listPublicApps } from "../lib/app-catalog";
import { APP_PAGE_COPY } from "../lib/app-pages-copy";
import { parseRadarFeed } from "../lib/radar";

describe("/apps hosting pages", () => {
  it("titles do not repeat the brand (the root layout template appends ' · Podway')", () => {
    for (const f of ["app/apps/page.tsx", "app/apps/[slug]/page.tsx", "app/radar/page.tsx"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/title: .*· Podway[`"]/);
    }
  });

  it("every public app has page copy, and no copy points at an app we do not offer", async () => {
    const apps = (await listPublicApps()).map((a) => a.name);
    expect(apps.length).toBeGreaterThanOrEqual(27);
    for (const a of apps) expect(APP_PAGE_COPY[a], `missing /apps copy for ${a}`).toBeTruthy();
    for (const k of Object.keys(APP_PAGE_COPY)) expect(apps, `copy for an app that is not offered: ${k}`).toContain(k);
  });
});

const item = (over: Record<string, unknown> = {}) => ({
  app: "Umami", slug: "umami", repo: "umami-software/umami",
  issue_url: "https://github.com/umami-software/umami/issues/4458", issue_number: 4458,
  title: "3.3.0 update will not start", what_broke: "3.3.0 update will not start",
  opened: "2026-10-05", state: "open", from_version: "3.2.0", to_version: "3.3.0", ...over,
});

describe("radar feed validation (rendered verbatim on public pages)", () => {
  it("accepts the GTM shape and maps it", () => {
    const f = parseRadarFeed({ updated: "2026-10-07", apps_watched: 27, window_days: 30, items: [item()] });
    expect(f).toMatchObject({ updated: "2026-10-07", appsWatched: 27, windowDays: 30 });
    expect(f!.items[0]).toMatchObject({ slug: "umami", issueNumber: 4458, fromVersion: "3.2.0", state: "open" });
  });

  it("drops items that are not a GitHub issue link, have a bad slug, or an over-long field", () => {
    const f = parseRadarFeed({
      updated: "2026-10-07",
      items: [
        item({ issue_url: "javascript:alert(1)" }),
        item({ issue_url: "https://evil.example/umami/issues/1" }),
        item({ slug: "Umami Analytics" }),
        item({ title: "x".repeat(301) }),
        item(),
      ],
    });
    expect(f!.items).toHaveLength(1);
  });

  it("rejects a bad envelope", () => {
    expect(parseRadarFeed(null)).toBeNull();
    expect(parseRadarFeed({ updated: "yesterday", items: [] })).toBeNull();
    expect(parseRadarFeed({ updated: "2026-10-07", items: Array.from({ length: 501 }, () => item()) })).toBeNull();
  });
});
