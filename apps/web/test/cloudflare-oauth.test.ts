import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The Cloudflare OAuth helpers. Env is read at module load, so we set it before a dynamic import.
 * We assert the authorize URL carries PKCE S256 + the exact scopes, PKCE pairs are well-formed, and
 * the token exchange uses Client Secret Basic and returns only the access token.
 */

process.env.CLOUDFLARE_OAUTH_CLIENT_ID = "test-client-id";
process.env.CLOUDFLARE_OAUTH_CLIENT_SECRET = "test-client-secret";

let oauth: typeof import("@/lib/cloudflare-oauth");
beforeAll(async () => {
  oauth = await import("@/lib/cloudflare-oauth");
});
afterEach(() => vi.unstubAllGlobals());

describe("cloudflare-oauth", () => {
  it("is configured when both client id and secret are present", () => {
    expect(oauth.cloudflareOAuthConfigured()).toBe(true);
  });

  it("builds an authorize URL with PKCE S256 and the least DNS+zone scopes", () => {
    const url = new URL(
      oauth.buildAuthorizeUrl({ state: "st8", challenge: "chal", redirectUri: "https://podway.io/api/cloudflare/oauth/callback" }),
    );
    expect(url.origin + url.pathname).toBe("https://dash.cloudflare.com/oauth2/auth");
    const p = url.searchParams;
    expect(p.get("client_id")).toBe("test-client-id");
    expect(p.get("response_type")).toBe("code");
    expect(p.get("code_challenge")).toBe("chal");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("state")).toBe("st8");
    expect(p.get("redirect_uri")).toBe("https://podway.io/api/cloudflare/oauth/callback");
    const scope = p.get("scope") ?? "";
    expect(scope).toContain("dns.write");
    expect(scope).toContain("zone.read");
  });

  it("makes a PKCE pair: challenge is base64url and differs from the verifier", () => {
    const { verifier, challenge } = oauth.makePkce();
    expect(verifier).not.toBe(challenge);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no +/=
    expect(verifier.length).toBeGreaterThan(20);
  });

  it("exchanges a code via Client Secret Basic and returns only the access token", async () => {
    let seenAuth = "";
    let seenBody = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        seenAuth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
        seenBody = String(init?.body ?? "");
        return { status: 200, ok: true, json: async () => ({ access_token: "at-123", refresh_token: "rt-should-be-ignored" }) } as unknown as Response;
      }),
    );
    const token = await oauth.exchangeCodeForToken({
      code: "code9",
      redirectUri: "https://podway.io/api/cloudflare/oauth/callback",
      verifier: "verf",
    });
    expect(token).toBe("at-123");
    const expected = "Basic " + Buffer.from("test-client-id:test-client-secret").toString("base64");
    expect(seenAuth).toBe(expected);
    expect(seenBody).toContain("grant_type=authorization_code");
    expect(seenBody).toContain("code_verifier=verf");
  });

  it("throws a clean error (no token) when the exchange fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 400, ok: false, json: async () => ({ error: "invalid_grant", error_description: "bad code" }) }) as unknown as Response),
    );
    await expect(
      oauth.exchangeCodeForToken({ code: "x", redirectUri: "https://podway.io/cb", verifier: "v" }),
    ).rejects.toThrow("bad code");
  });
});
