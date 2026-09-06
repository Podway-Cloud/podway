import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/blog", () => ({ getAllPosts: () => [] }));
vi.mock("@/lib/docs-source", () => ({
  docsSource: {
    getPages: () => [
      {
        url: "/docs",
        data: { title: "Documentation", description: "Public Podway documentation." },
      },
    ],
  },
}));
vi.mock("@/lib/session", () => ({ editionOss: () => false }));

import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { GET as llmsTxt } from "../app/llms.txt/route";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const layoutSource = read("../app/layout.tsx");
const homeSource = read("../app/page.tsx");
const selfhostSource = read("../app/selfhost/page.tsx");
const blogPostSource = read("../app/blog/[slug]/page.tsx");
const landingFooterSource = read("../components/landing-footer.tsx");
const previewSources = [
  read("../app/preview/landing/agent-computer/page.tsx"),
  read("../app/preview/landing/agent-home/page.tsx"),
  read("../app/preview/landing/outcomes/page.tsx"),
];

describe("public search metadata", () => {
  it("uses podway.io for crawler discovery and every sitemap URL", () => {
    const routes = robots();
    expect(routes.sitemap).toBe("https://podway.io/sitemap.xml");
    expect(routes.host).toBe("https://podway.io");

    const urls = sitemap().map((entry) => entry.url);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url === "https://podway.io" || url.startsWith("https://podway.io/")))
      .toBe(true);
  });

  it("keeps product schema on the two relevant landing pages, not every app route", () => {
    expect(layoutSource).not.toContain('type="application/ld+json"');
    expect(homeSource).toContain('type="application/ld+json"');
    expect(selfhostSource).toContain('type="application/ld+json"');
  });

  it("does not publish the retired app origin from landing metadata", () => {
    for (const source of [homeSource, selfhostSource]) {
      expect(source).not.toContain("https://podway.cloud");
    }
  });

  it("uses the canonical brand domain in the public landing footer", () => {
    expect(landingFooterSource).toContain("podway.io · ©");
    expect(landingFooterSource).not.toContain("podway.cloud · ©");
  });

  it("uses the canonical origin in blog schema and the agent-readable docs index", async () => {
    expect(blogPostSource).toContain('https://podway.io/blog/');
    expect(blogPostSource).not.toContain("https://podway.cloud");

    const body = await (await llmsTxt()).text();
    expect(body).toContain("https://podway.io/docs");
    expect(body).not.toContain("https://podway.cloud");
  });

  it("points every landing preview back to the canonical public homepage", () => {
    for (const source of previewSources) {
      expect(source).toContain('canonical: "https://podway.io/"');
      expect(source).not.toContain("https://podway.cloud");
    }
  });

  it("uses the current branded image for both root social-card conventions", () => {
    const openGraph = readFileSync(new URL("../app/opengraph-image.png", import.meta.url));
    const twitter = readFileSync(new URL("../app/twitter-image.png", import.meta.url));
    expect(twitter.equals(openGraph)).toBe(true);
  });
});
