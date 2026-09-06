import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createLogger } from "@podway/shared/log";
import { getCurrentUser } from "@/lib/session";
import { exchangeCodeForToken, safeReturnPath, OAUTH_CALLBACK_PATH } from "@/lib/github-oauth";
import { storeConnection } from "@/lib/github-connect";
import { getPodService } from "@/lib/pod-service";

export const dynamic = "force-dynamic";

const log = createLogger("web-gh-oauth-callback");
const OAUTH_COOKIE = "gh_oauth";

/**
 * GitHub OAuth web-flow callback: validate the CSRF `state` against our short-lived cookie, exchange
 * the `code` for a token server-side, store the encrypted connection, and bounce back to where the
 * user started (with a `?github=connected|denied|error` marker the field reads). One-click; no device
 * code. See lib/github-oauth.ts + startGithubAccountWebConnect.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // ALL redirects must use the app's canonical URL, NOT url.origin. Behind Fly, url.origin is the
  // pod's internal bind (https://0.0.0.0:3000), so redirecting there sent the browser to a dead
  // 0.0.0.0 page with ERR_FAILED even after a SUCCESSFUL connect (velsa, 2026-08-31).
  const base = process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "") || url.origin;
  const jar = await cookies();
  const raw = jar.get(OAUTH_COOKIE)?.value;
  jar.delete(OAUTH_COOKIE);
  let saved: { state?: string; returnPath?: string } = {};
  try {
    saved = raw ? (JSON.parse(raw) as { state?: string; returnPath?: string }) : {};
  } catch {
    /* corrupt cookie → treat as no state, fail closed below */
  }
  const back = (status: "connected" | "denied" | "error"): Response => {
    const dest = new URL(safeReturnPath(saved.returnPath), base);
    dest.searchParams.set("github", status);
    return NextResponse.redirect(dest);
  };

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/signin", base));

  // The user declined on GitHub (or GitHub returned an error) — not a failure to surface loudly.
  if (url.searchParams.get("error")) return back("denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !saved.state || state !== saved.state) {
    log.warn("gh_oauth_state_mismatch", { hasCode: !!code, hasState: !!state, hasCookie: !!saved.state });
    return back("error");
  }

  try {
    // Must match the redirect_uri the authorize step sent (the canonical base) or GitHub rejects it.
    const token = await exchangeCodeForToken(code, `${base}${OAUTH_CALLBACK_PATH}`);
    await storeConnection(user.id, token);
    // Fan the durable connection out to every owned pod (fire-and-forget; re-syncs offline pods on
    // wake) so a one-click connect grants GitHub access everywhere at once.
    void getPodService()
      .syncGithubToOwnedPods(user.id, token)
      .catch((e) => log.error("gh_oauth_fanout_failed", { userId: user.id, err: e }));
    return back("connected");
  } catch (e) {
    log.error("gh_oauth_exchange_failed", { userId: user.id, err: e });
    return back("error");
  }
}
