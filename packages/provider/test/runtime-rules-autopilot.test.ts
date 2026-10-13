import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/** The "(Recommended)" rule protects "Always choose recommended", which works WITHOUT Relentless — and the
 * pod strips the <!-- podway:relentless --> block when Relentless is off. So the rule must live OUTSIDE it
 * (it shipped inside it once: test:1, 2026-10-11, rule silently missing). */
describe("autopilot rules reach every pod", () => {
  it("the (Recommended) and wake rules are outside the Relentless-only block", () => {
    const md = readFileSync(new URL("../pod-base/runtime-rules.md", import.meta.url), "utf8");
    const stripped = md.replace(/<!-- podway:relentless -->[\s\S]*?<!-- \/podway:relentless -->/, "");
    expect(stripped).toContain('"(Recommended)" means "safe to pick without the owner"');
    expect(stripped).toContain("When autopilot wakes you");
  });
});
