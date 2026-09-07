import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { customDomainsProvisioned } from "@/lib/custom-domain-config";

/**
 * Custom domains cannot work until the TLS edge exists: a dedicated anycast IPv4 (for apex
 * A-records) and the CNAME host customers point at. Until both are provisioned the feature must be
 * invisible — a visible wizard would hand an owner DNS records that can never verify and leave them
 * waiting on a certificate nobody can issue.
 *
 * The trap this pins: the original code DEFAULTED cnameTarget to "cname.podway.cloud", a host that
 * does not exist. A default is what makes an unprovisioned placeholder look like a working target.
 */
describe("custom domains stay hidden until the edge is provisioned", () => {
  const saved = {
    cname: process.env.PODWAY_DOMAIN_CNAME_TARGET,
    ip: process.env.PODWAY_DOMAIN_ANYCAST_IP,
  };
  beforeEach(() => {
    delete process.env.PODWAY_DOMAIN_CNAME_TARGET;
    delete process.env.PODWAY_DOMAIN_ANYCAST_IP;
  });
  afterEach(() => {
    if (saved.cname === undefined) delete process.env.PODWAY_DOMAIN_CNAME_TARGET;
    else process.env.PODWAY_DOMAIN_CNAME_TARGET = saved.cname;
    if (saved.ip === undefined) delete process.env.PODWAY_DOMAIN_ANYCAST_IP;
    else process.env.PODWAY_DOMAIN_ANYCAST_IP = saved.ip;
  });

  it("is OFF when neither value is set — the default state today", () => {
    expect(customDomainsProvisioned()).toBe(false);
  });

  it("is OFF with only the CNAME target — an apex domain still has no A-record to point at", () => {
    process.env.PODWAY_DOMAIN_CNAME_TARGET = "cname.podway.cloud";
    expect(customDomainsProvisioned()).toBe(false);
  });

  it("is OFF with only the anycast IP — nothing tells a customer what to CNAME to", () => {
    process.env.PODWAY_DOMAIN_ANYCAST_IP = "203.0.113.7";
    expect(customDomainsProvisioned()).toBe(false);
  });

  it("is ON only once BOTH are set", () => {
    process.env.PODWAY_DOMAIN_CNAME_TARGET = "cname.podway.cloud";
    process.env.PODWAY_DOMAIN_ANYCAST_IP = "203.0.113.7";
    expect(customDomainsProvisioned()).toBe(true);
  });

  it("treats an EMPTY string as unset — an unfilled fly secret must not switch it on", () => {
    process.env.PODWAY_DOMAIN_CNAME_TARGET = "";
    process.env.PODWAY_DOMAIN_ANYCAST_IP = "";
    expect(customDomainsProvisioned()).toBe(false);
  });
});
