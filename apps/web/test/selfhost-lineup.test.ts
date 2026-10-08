import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { LINEUP } from "../app/selfhost/selfhost-lineup";

// The landing lineup must only advertise apps we actually run, at the price the wizard will charge.
const repo = path.resolve(__dirname, "../../..");
const gallery = readFileSync(path.join(repo, "apps/web/lib/app-catalog.ts"), "utf8");
const hidden = gallery.slice(gallery.indexOf("HIDDEN_APPS"), gallery.indexOf("]);", gallery.indexOf("HIDDEN_APPS")));

describe("self-host landing lineup", () => {
  it("has exactly 12 distinct apps", () => {
    expect(LINEUP).toHaveLength(12);
    expect(new Set(LINEUP.map((a) => a.slug)).size).toBe(12);
  });

  for (const app of LINEUP) {
    it(`${app.slug}: a visible catalog app with a real price, logo and pinned image`, () => {
      const yaml = readFileSync(path.join(repo, "environments", app.slug, "podway.yaml"), "utf8");
      expect(yaml).toMatch(/^kind: app$/m);
      const minSize = yaml.match(/^minSize:\s*(\S+)/m)?.[1] ?? "mini";
      expect(app.minSize).toBe(minSize);
      expect(app.replaces.trim()).not.toBe("");
      expect(hidden).not.toContain(`"${app.slug}"`);
      expect(existsSync(path.join(repo, "apps/web/public", app.logo))).toBe(true);
      // "Big jumps wait for you" needs a known version: the install default is an exact tag, never latest.
      const manifest = readFileSync(path.join(repo, "environments", app.slug, "app.manifest"), "utf8");
      const imageVar = manifest.match(/^APP_IMAGE_VAR=(\S+)/m)?.[1];
      expect(imageVar).toBeTruthy();
      expect(yaml).toContain(`${imageVar}=%s`);
      const tags = [...yaml.matchAll(/"([a-z0-9][a-z0-9./_-]*):([A-Za-z0-9._-]+)"/g)].map((m) => m[2]);
      expect(tags.length).toBeGreaterThan(0);
      for (const t of tags) expect(t).not.toMatch(/latest/);
    });
  }
});
