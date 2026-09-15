import { describe, it, expect } from "vitest";
import { isDisallowedTarget } from "../src/net-guard.js";

/**
 * The SSRF classifier that decides whether a host is an internal/link-local/private target a fetch
 * must refuse. It was only tested transitively (through the relay's byte-copy); this pins the ORIGINAL
 * directly, because a hole here lets a pod reach the metadata service, the host, or the private net.
 */
describe("isDisallowedTarget — refuses internal/private/link-local targets", () => {
  const DISALLOWED = [
    "localhost",
    "app.localhost",
    "127.0.0.1",
    "127.53.1.9",
    "10.0.0.1",
    "10.255.255.255",
    "0.0.0.0",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1", // CGNAT
    "100.127.255.255",
    "224.0.0.1", // multicast
    "255.255.255.255",
    "999.1.1.1", // malformed → refuse
    "::1",
    "[::1]", // bracketed
    "::",
    "fe80::1", // link-local
    "feb0::1",
    "fc00::1", // unique-local
    "fd12:3456::1",
    "::ffff:127.0.0.1", // v4-mapped loopback
    "::ffff:169.254.169.254", // v4-mapped metadata
  ];
  for (const h of DISALLOWED) {
    it(`refuses ${h}`, () => expect(isDisallowedTarget(h)).toBe(true));
  }
});

describe("isDisallowedTarget — allows public targets", () => {
  const ALLOWED = [
    "example.com",
    "api.github.com",
    "8.8.8.8",
    "1.1.1.1",
    "172.15.0.1", // just below the 172.16/12 private range
    "172.32.0.1", // just above it
    "192.167.0.1", // not 192.168
    "192.169.0.1",
    "100.63.255.255", // just below CGNAT
    "100.128.0.0", // just above CGNAT
    "223.255.255.255", // just below multicast
    "2001:4860:4860::8888", // public IPv6
    "2606:4700:4700::1111",
  ];
  for (const h of ALLOWED) {
    it(`allows ${h}`, () => expect(isDisallowedTarget(h)).toBe(false));
  }
});
