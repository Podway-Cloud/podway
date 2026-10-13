import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Apps install a FIXED version (owner, 2026-10-11): `:latest` drifts between pods and can change an app's
 * version on a restart without anyone asking. Upgrades go through app-admin safe-upgrade (snapshot +
 * auto-rollback). Excalidraw publishes no version tags at all — the one exception. */
const ROOT = join(__dirname, "../../../environments");
const NO_VERSIONS_PUBLISHED = new Set(["excalidraw"]);

describe("app images are pinned", () => {
  it("no app env installs :latest or an untagged image", () => {
    const bad: string[] = [];
    for (const env of readdirSync(ROOT)) {
      if (NO_VERSIONS_PUBLISHED.has(env)) continue;
      for (const f of ["podway.yaml", "compose.yaml"]) {
        const p = join(ROOT, env, f);
        if (!existsSync(p)) continue;
        const s = readFileSync(p, "utf8");
        for (const m of s.matchAll(/[\w.-]+(?:\.[a-z]+)?\/[\w./-]+:latest\b/g)) bad.push(`${env}/${f}: ${m[0]}`);
        for (const m of s.matchAll(/^\s*image:\s*([a-z0-9./_-]+)\s*$/gm)) bad.push(`${env}/${f}: untagged ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
