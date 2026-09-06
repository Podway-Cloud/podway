import { describe, expect, it } from "vitest";
import { sanitizeRef, REF_MAX_LEN } from "../src/attribution.js";

describe("sanitizeRef (deeplink-onboarding)", () => {
  it("accepts a normal campaign/source tag", () => {
    expect(sanitizeRef("hn")).toBe("hn");
    expect(sanitizeRef("partner-x")).toBe("partner-x");
    expect(sanitizeRef("utm.show-hn_2026")).toBe("utm.show-hn_2026");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeRef("  hn  ")).toBe("hn");
  });

  it("rejects markup/script content instead of storing it verbatim", () => {
    expect(sanitizeRef("<script>alert(1)</script>")).toBeNull();
    expect(sanitizeRef("javascript:alert(1)")).toBeNull();
  });

  it("rejects a value with spaces or other disallowed characters", () => {
    expect(sanitizeRef("has spaces")).toBeNull();
    expect(sanitizeRef("has/slash")).toBeNull();
    expect(sanitizeRef("has?query=1")).toBeNull();
  });

  it("caps length rather than storing an oversized value", () => {
    const huge = "a".repeat(500);
    const capped = sanitizeRef(huge);
    expect(capped).not.toBeNull();
    expect(capped!.length).toBe(REF_MAX_LEN);
    expect(capped).toBe("a".repeat(REF_MAX_LEN));
  });

  it("treats missing/empty/non-string input as absent", () => {
    expect(sanitizeRef(undefined)).toBeNull();
    expect(sanitizeRef(null)).toBeNull();
    expect(sanitizeRef("")).toBeNull();
    expect(sanitizeRef("   ")).toBeNull();
  });
});
