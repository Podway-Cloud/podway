import { describe, expect, it } from "vitest";
import { normalizeHostname, isApexHostname, recordTypeFor } from "../src/custom-domain.js";

describe("normalizeHostname (add-custom-domains)", () => {
  it("accepts normal subdomains + apex domains", () => {
    expect(normalizeHostname("app.acme.com")).toBe("app.acme.com");
    expect(normalizeHostname("acme.com")).toBe("acme.com");
    expect(normalizeHostname("a.b.c.example.co.uk")).toBe("a.b.c.example.co.uk");
    expect(normalizeHostname("xn--80ak6aa92e.com")).toBe("xn--80ak6aa92e.com"); // punycode IDN
  });

  it("normalizes case, whitespace, a trailing dot, and a pasted URL", () => {
    expect(normalizeHostname("  App.ACME.com  ")).toBe("app.acme.com");
    expect(normalizeHostname("app.acme.com.")).toBe("app.acme.com");
    expect(normalizeHostname("https://app.acme.com/dashboard?x=1")).toBe("app.acme.com");
  });

  it("rejects non-hostnames", () => {
    for (const bad of ["", "localhost", "no dots", "-lead.com", "trail-.com", "a..b.com", "app_.com", null, undefined]) {
      expect(normalizeHostname(bad as string)).toBeNull();
    }
  });

  it("rejects over-length input", () => {
    expect(normalizeHostname("a".repeat(300) + ".com")).toBeNull();
  });
});

describe("record type", () => {
  it("apex → A, subdomain → CNAME", () => {
    expect(isApexHostname("acme.com")).toBe(true);
    expect(isApexHostname("app.acme.com")).toBe(false);
    expect(recordTypeFor("acme.com")).toBe("a");
    expect(recordTypeFor("app.acme.com")).toBe("cname");
  });
});
