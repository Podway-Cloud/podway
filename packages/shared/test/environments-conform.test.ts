import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateEnvironment } from "../src/index.js";

const envRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "environments",
);

/** Every first-party environment under environments/ must validate (5.2). */
describe("first-party environments conform to podway/v0", () => {
  it("all environments/*/podway.yaml validate", async () => {
    const entries = await fs.readdir(envRoot, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    expect(dirs.length).toBeGreaterThan(0);

    let validated = 0;
    for (const d of dirs) {
      const yamlPath = path.join(envRoot, d.name, "podway.yaml");
      const yaml = await fs.readFile(yamlPath, "utf8").catch(() => null);
      if (yaml === null) continue; // dir without a podway.yaml is not an environment (e.g. _shared)
      const r = validateEnvironment(yaml);
      expect(r.ok, `${d.name}: ${r.errors.join("; ")}`).toBe(true);
      validated++;
    }
    // Floor so the test can't quietly pass by SKIPPING every env — a mass-disappearance of
    // podway.yaml (a rename, a bad glob) would otherwise validate nothing and still go green.
    expect(validated, "no first-party environment yamls were found to validate").toBeGreaterThanOrEqual(3);
  });
});
