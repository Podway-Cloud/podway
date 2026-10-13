import { describe, expect, it, vi, afterEach } from "vitest";
import { earlyAccessFreeGb, freePodGb } from "../src/tiers.js";

afterEach(() => vi.unstubAllEnvs());

describe("grandfathered early-access free pod", () => {
  const early = new Date("2026-10-01T00:00:00Z");
  it("during early access: a Mini (a Small for a lead link); none without a sign-up date", () => {
    expect(earlyAccessFreeGb(null, early)).toBe(1);
    expect(earlyAccessFreeGb("email-oct", early)).toBe(2);
    expect(earlyAccessFreeGb("selfhst-tile-memos", early)).toBe(2);
    expect(earlyAccessFreeGb(null, null)).toBe(0);
  });
  it("after early access ends: accounts created before keep it, new ones do not", () => {
    vi.stubEnv("PODWAY_EARLY_ACCESS_ENDED_AT", "2027-01-01T00:00:00Z");
    expect(earlyAccessFreeGb(null, early)).toBe(1);
    expect(earlyAccessFreeGb(null, new Date("2027-01-02T00:00:00Z"))).toBe(0);
  });
  it("a bigger claimed offer wins", () => {
    expect(freePodGb({ offer: "noted-jeremy", createdAt: early })).toBe(4);
  });
});
