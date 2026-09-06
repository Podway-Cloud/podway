import { describe, it, expect } from "vitest";
import { canonicalRedirectHost } from "../lib/canonical-host";

describe("canonicalRedirectHost", () => {

  it("sends podway.cloud (now previews-only, apex + www) to podway.io", () => {
    expect(canonicalRedirectHost("podway.cloud")).toBe("podway.io");
    expect(canonicalRedirectHost("www.podway.cloud")).toBe("podway.io");
  });

  it("collapses www.podway.io to the canonical apex", () => {
    expect(canonicalRedirectHost("www.podway.io")).toBe("podway.io");
  });

  it("leaves the canonical app host alone", () => {
    expect(canonicalRedirectHost("podway.io")).toBeNull();
  });

  it("does not touch preview/gateway/fly/localhost hosts", () => {
    // Preview subdomains route to the gateway, never to this app — never rewrite them.
    expect(canonicalRedirectHost("my-pod.podway.cloud")).toBeNull();
    expect(canonicalRedirectHost("gateway.podway.cloud")).toBeNull();
    expect(canonicalRedirectHost("podway-web.fly.dev")).toBeNull();
    expect(canonicalRedirectHost("localhost:3000")).toBeNull();
    expect(canonicalRedirectHost(null)).toBeNull();
  });

  it("preserves a port when present (local/dev)", () => {
    expect(canonicalRedirectHost("www.podway.cloud:3000")).toBe("podway.io:3000");
  });
});
