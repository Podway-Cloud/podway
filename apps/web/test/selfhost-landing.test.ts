import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LANDING_EXPERIMENT,
  LANDING_EXPERIMENTS,
  SELFHOST_HOMEPAGE_CONTROL,
  isLandingVariant,
} from "../lib/landing-experiment-config";
import { selfhostLandingMetadata } from "../lib/selfhost-landing-metadata";

const route = readFileSync(new URL("../app/selfhost/page.tsx", import.meta.url), "utf8");
const landing = readFileSync(
  new URL("../app/selfhost/selfhost-landing.tsx", import.meta.url),
  "utf8",
);
const root = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

describe("self-host landing and homepage promotion", () => {
  it("keeps the self-host page stable and separate from acquisition measurement", () => {
    const metadata = selfhostLandingMetadata("https://podway.io/selfhost");
    expect(metadata.alternates?.canonical).toBe("https://podway.io/selfhost");
    expect(metadata.openGraph?.url).toBe("https://podway.io/selfhost");
    expect(metadata.openGraph?.images).toEqual([
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Podway",
      },
    ]);
    expect(metadata.twitter?.images).toEqual([
      { url: "/twitter-image.png", alt: "Podway" },
    ]);
    expect(metadata.title).toContain("Host open-source apps");
    expect(metadata.description).toContain("Podway's always-on cloud pods");
    expect(route).toContain('export const dynamic = "force-dynamic"');
    expect(route).toContain("if (editionOss()) redirect(\"/dashboard\")");
    expect(route).toContain("<SelfhostLanding");
    expect(LANDING_EXPERIMENT.id).not.toBe(SELFHOST_HOMEPAGE_CONTROL.id);
    expect(SELFHOST_HOMEPAGE_CONTROL.controlType).toBe("homepage-promotion");
    expect(SELFHOST_HOMEPAGE_CONTROL.variants).toEqual(["selfhost"]);
    expect(LANDING_EXPERIMENTS).toContain(SELFHOST_HOMEPAGE_CONTROL);
    expect(isLandingVariant("selfhost")).toBe(true);
  });

  // The admin switch itself ("One landing only → Self-host") is behavior-tested in homepage-traffic.test.ts.
  it("can serve the self-host landing at the root", () => {
    expect(root).toContain("isSelfhostHomepageEnabled");
    expect(root).toContain("<SelfhostLanding");
    expect(root).toContain("export async function generateMetadata");
    expect(root).toContain('selfhostLandingMetadata("https://podway.io/")');
  });

  it("keeps the account and app-specific launch paths", () => {
    expect(landing).toContain('const primaryHref = "/start?tab=apps&ref=selfhost-landing";');
    expect(landing).toContain('const primaryLabel = "Start free";');
    expect(landing).toContain('href={`/start?app=${app.slug}&ref=selfhost-lineup`}');
    expect(landing).toContain('href="/start?tab=apps&ref=selfhost-full-catalog"');
    expect(landing).toContain('href={`/start?tab=apps&ref=selfhost-pricing-${t.id}`}');
    expect(landing).toContain('item="selfhost-hero"');
    expect(landing).toContain('item="selfhost-final"');
  });

  it("explains where an app runs and links to the app catalog", () => {
    expect(landing).toContain("Podway runs it 24/7 in a cloud pod.");
    expect(landing).toContain('href="#apps">Browse apps</a>');
    expect(landing).not.toContain('id="how-it-works"');
    expect(landing).toContain("Where does my app run?");
  });

  it("shows starting prices and replacement labels without comparison prices", () => {
    expect(landing).toContain("LINEUP.map((app)");
    expect(landing).toContain("appPriceUsd(app)");
    expect(landing).toContain("app.benefit");
    expect(landing).toContain("Replaces {app.replaces}");
    expect(landing).not.toContain("app.chore");
    expect(landing).not.toContain("styles.chip");
    expect(landing).not.toContain("Set up {app.name}");
    expect(landing).toContain("get it running in minutes with your AI admin in control");
  });

  it("covers setup, troubleshooting, credentials and recovery before pricing", () => {
    for (const title of ["Set up your app", "Investigate problems", "Keep secrets out of chat", "Back up and roll back"]) {
      expect(landing).toContain(title);
    }
    expect(landing.indexOf('<ul className={styles.included}>')).toBeGreaterThan(landing.indexOf('id="trust"'));
    expect(landing.indexOf('<ul className={styles.included}>')).toBeLessThan(landing.indexOf('id="pricing"'));
    expect(landing).not.toContain("Your Claude plan is separate.");
    expect(landing).not.toContain("Watches upstream");
    expect(landing.indexOf('id="apps"')).toBeLessThan(landing.indexOf('id="trust"'));
  });
});
