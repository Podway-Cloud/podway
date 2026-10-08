import { describe, it, expect, vi } from "vitest";

// Match prod: the no-card budget is one Mini (Fly secret PODWAY_ACCOUNT_RAM_GB=1).
vi.hoisted(() => {
  process.env.PODWAY_ACCOUNT_RAM_GB = "1";
});
const { freeSetupNote } = await import("../lib/free-setup-note");

/** The sign-in "free during early access" line must match what billing really gives free (shared noCardRamGb). */
describe("sign-in free setup note", () => {
  it("names a Mini app as free", async () => {
    expect(await freeSetupNote("/start?app=uptime-kuma&ref=selfhost-lineup")).toMatch(/^You're setting up Uptime Kuma — free during early access/);
  });
  it("a Small app is free only for an email-* lead", async () => {
    expect(await freeSetupNote("/start?app=n8n&ref=selfhost-lineup")).toBeUndefined();
    expect(await freeSetupNote("/start?app=n8n&ref=email-batch-a")).toMatch(/n8n — free during early access/);
  });
  it("no line for other targets or unknown apps", async () => {
    expect(await freeSetupNote("/dashboard")).toBeUndefined();
    expect(await freeSetupNote("/start?app=nope-not-an-app")).toBeUndefined();
    expect(await freeSetupNote("/start?app=../etc")).toBeUndefined();
  });
});
