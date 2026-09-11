"use server";
import { cookies, headers } from "next/headers";
import { requireApprovedUser } from "@/lib/access";
import { editionOss } from "@/lib/session";
import { getPodService } from "@/lib/pod-service";
import { customDomainsProvisioned } from "@/lib/custom-domain-config";
import {
  cloudflareOAuthConfigured,
  buildAuthorizeUrl,
  makePkce,
  makeState,
  OAUTH_CALLBACK_PATH,
  CF_OAUTH_COOKIE,
  safeReturnPath,
} from "@/lib/cloudflare-oauth";

// CF_OAUTH_COOKIE + safeReturnPath moved to cloudflare-oauth.ts: a "use server" file may export ONLY
// async functions, so a const and a sync helper can't be exported from here (breaks `next build`).

/**
 * Start "Connect Cloudflare": authorize the caller for the pod, then stash a signed-by-httpOnly-cookie
 * PKCE verifier + CSRF state + the target (slug/host) and return the Cloudflare authorize URL for the
 * browser to navigate to. The callback (/api/cloudflare/oauth/callback) validates state, exchanges the
 * code, and writes the records. Cloud-only. No token is created or handled here.
 */
export async function startCloudflareConnect(
  slug: string,
  host: string,
  returnPath: string,
): Promise<{ url: string } | { error: string }> {
  const user = await requireApprovedUser();
  if (editionOss()) return { error: "Custom domains are a cloud feature." };
  if (!customDomainsProvisioned()) return { error: "Custom domains aren't available yet." };
  if (!cloudflareOAuthConfigured()) return { error: "Cloudflare connect isn't configured." };
  // Authz: throws unless this user owns the pod — the same gate every domain action uses.
  await getPodService().getPod(user.id, slug);

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  // redirect_uri MUST be the app's REGISTERED callback (its canonical URL). On a pod the host header is
  // the internal 0.0.0.0:3000 bind, which Cloudflare rejects — prefer BETTER_AUTH_URL (same gotcha as
  // the GitHub flow, velsa 2026-08-31), fall back to the request host.
  const canonical = process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "");
  const hostHeader = h.get("host");
  const origin = canonical || (hostHeader ? `${proto}://${hostHeader}` : "");
  if (!origin) return { error: "could not determine callback origin" };

  const state = makeState();
  const { verifier, challenge } = makePkce();
  const jar = await cookies();
  jar.set(
    CF_OAUTH_COOKIE,
    JSON.stringify({ state, verifier, slug, host, returnPath: safeReturnPath(returnPath) }),
    { httpOnly: true, secure: proto === "https", sameSite: "lax", path: "/", maxAge: 600 },
  );
  return { url: buildAuthorizeUrl({ state, challenge, redirectUri: `${origin}${OAUTH_CALLBACK_PATH}` }) };
}
