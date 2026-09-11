import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Cloudflare OAuth (self-managed OAuth clients, GA 2026-06-03) — the "Connect Cloudflare" one-click
 * DNS auto-setup. Authorization-Code + PKCE (S256), confidential client (Client Secret Basic). After
 * the owner consents we get a short-lived access token, use it ONCE to write the custom-domain
 * records (see cloudflare-dns.ts), then drop it — no persistence (design D3). The token is obtained
 * and used SERVER-side only; it never reaches the browser and is never logged.
 *
 * Scope strings are Cloudflare's dot-delimited permission ids (confirmed live against
 * GET /client/v4/oauth/scopes): "DNS Write" = `dns.write`, "Zone Read" = `zone.read`. `openid` lets
 * the token endpoint behave as OIDC. We deliberately do NOT request `offline_access` — a refresh
 * token we would only drop is retention we don't need. The client must be configured with (at least)
 * these scopes in the Cloudflare dashboard. `CLOUDFLARE_OAUTH_SCOPE` can override the string without a
 * redeploy if Cloudflare ever renames a scope.
 */

const CLIENT_ID = process.env.CLOUDFLARE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.CLOUDFLARE_OAUTH_CLIENT_SECRET;
const SCOPE = process.env.CLOUDFLARE_OAUTH_SCOPE?.trim() || "openid dns.write zone.read";

const AUTHORIZE_URL = "https://dash.cloudflare.com/oauth2/auth";
const TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";

/** The path Cloudflare redirects back to; must match the OAuth client's registered redirect URI. */
export const OAUTH_CALLBACK_PATH = "/api/cloudflare/oauth/callback";

/** Available only when BOTH the client id and secret are set. Without them the wizard hides the button
 * and the manual DNS records stay the universal fallback — shipping never breaks an unconfigured env. */
export function cloudflareOAuthConfigured(): boolean {
  return !!CLIENT_ID && !!CLIENT_SECRET;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A PKCE pair: a high-entropy verifier (kept server-side in the state cookie) and its S256 challenge
 * (sent in the authorize URL). Defense in depth on top of the confidential-client secret. */
export function makePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/** A random CSRF `state` (bound to a short-lived httpOnly cookie by the caller). */
export function makeState(): string {
  return randomBytes(16).toString("hex");
}

/** The Cloudflare authorize URL — the browser is sent here; the owner picks the account and consents. */
export function buildAuthorizeUrl(opts: { state: string; challenge: string; redirectUri: string }): string {
  if (!CLIENT_ID) throw new Error("Cloudflare OAuth isn't configured");
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: opts.redirectUri,
    scope: SCOPE,
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE_URL}?${p.toString()}`;
}

/** Exchange the callback `code` for an access token — Client Secret Basic, server-side, so the secret
 * never reaches the client. `redirectUri` and `verifier` must match the ones that started the flow.
 * Returns only the access token; the raw response (which may carry a refresh token) is not surfaced. */
export async function exchangeCodeForToken(opts: {
  code: string;
  redirectUri: string;
  verifier: string;
}): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("Cloudflare OAuth isn't configured");
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: opts.code,
      redirect_uri: opts.redirectUri,
      code_verifier: opts.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const d = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !d.access_token) {
    // error/error_description are Cloudflare's OAuth error codes — safe to surface; no token here.
    throw new Error(d.error_description || d.error || `Cloudflare token exchange failed (${res.status})`);
  }
  return d.access_token;
}
