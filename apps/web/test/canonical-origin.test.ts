import { describe, it, expect, afterEach } from "vitest";
import { canonicalOrigin } from "@/lib/canonical-origin";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

const hdrs = (m: Record<string, string>) => ({ get: (k: string) => m[k.toLowerCase()] ?? null });

/**
 * Guards the bug that has now shipped twice: a redirect built from the request's own host, which
 * behind Fly's proxy is the internal bind address, sending the browser to https://0.0.0.0:3000.
 */
describe("canonicalOrigin", () => {
  it("prefers the configured canonical URL over the request host", () => {
    process.env.BETTER_AUTH_URL = "https://podway.io";
    expect(canonicalOrigin(hdrs({ host: "0.0.0.0:3000" }))).toBe("https://podway.io");
  });

  it("REFUSES a bind address rather than building a dead URL", () => {
    // The whole point. Returning a URL here is worse than returning nothing: the caller would send
    // a real person to a page that cannot load.
    delete process.env.BETTER_AUTH_URL;
    for (const host of ["0.0.0.0:3000", "0.0.0.0", "[::]:3000", "::"]) {
      expect(canonicalOrigin(hdrs({ host })), host).toBeNull();
    }
  });

  it("falls back to the request host for local dev and self-host", () => {
    delete process.env.BETTER_AUTH_URL;
    expect(canonicalOrigin(hdrs({ host: "localhost:3000", "x-forwarded-proto": "http" }))).toBe(
      "http://localhost:3000",
    );
    expect(canonicalOrigin(hdrs({ host: "pods.example.com" }))).toBe("https://pods.example.com");
  });

  it("returns null when there is nothing to build from", () => {
    delete process.env.BETTER_AUTH_URL;
    expect(canonicalOrigin(hdrs({}))).toBeNull();
  });

  it("tolerates a trailing slash on the configured URL", () => {
    process.env.BETTER_AUTH_URL = "https://podway.io/";
    expect(canonicalOrigin(hdrs({ host: "x" }))).toBe("https://podway.io");
  });
});
