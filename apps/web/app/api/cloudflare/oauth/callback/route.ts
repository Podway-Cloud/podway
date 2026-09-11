import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createLogger } from "@podway/shared/log";
import { getCurrentUser, editionOss } from "@/lib/session";
import { exchangeCodeForToken, OAUTH_CALLBACK_PATH } from "@/lib/cloudflare-oauth";
import { CF_OAUTH_COOKIE, safeReturnPath } from "@/lib/cloudflare-connect-actions";
import { customDomainService } from "@/lib/custom-domain-service";
import { writeCustomDomainRecords } from "@/lib/cloudflare-dns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("web-cf-oauth-callback");

/** Status markers the wizard reads from `?cf=`: what to tell the owner on return. */
type CfStatus = "ok" | "declined" | "badstate" | "notzone" | "scope" | "error";

/**
 * Cloudflare OAuth callback: validate the CSRF `state` against our short-lived cookie, exchange the
 * `code` for an access token SERVER-side, write the custom domain's records into the owner's zone, then
 * drop the token (no persistence — design D3). Any failure leaves the manual records intact and bounces
 * back with a specific `?cf=` reason. The token is never sent to the client and never logged.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // Redirect to the app's canonical URL, NOT url.origin — behind Fly, url.origin is the pod's internal
  // 0.0.0.0:3000 bind (velsa, 2026-08-31, the GitHub flow hit this).
  const base = process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "") || url.origin;

  const jar = await cookies();
  const raw = jar.get(CF_OAUTH_COOKIE)?.value;
  jar.delete(CF_OAUTH_COOKIE);
  let saved: { state?: string; verifier?: string; slug?: string; host?: string; returnPath?: string } = {};
  try {
    saved = raw ? JSON.parse(raw) : {};
  } catch {
    /* corrupt cookie → fail closed below */
  }

  const back = (status: CfStatus): Response => {
    const dest = new URL(safeReturnPath(saved.returnPath), base);
    dest.searchParams.set("cf", status);
    return NextResponse.redirect(dest);
  };

  if (editionOss()) return NextResponse.redirect(new URL("/dashboard", base));
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/signin", base));

  // The owner declined on Cloudflare (or Cloudflare returned an error) — expected, not a loud failure.
  if (url.searchParams.get("error")) return back("declined");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !saved.state || state !== saved.state || !saved.verifier || !saved.slug || !saved.host) {
    log.warn("cf_oauth_state_mismatch", { hasCode: !!code, hasState: !!state, hasCookie: !!saved.state });
    return back("badstate");
  }

  let token: string;
  try {
    token = await exchangeCodeForToken({ code, redirectUri: `${base}${OAUTH_CALLBACK_PATH}`, verifier: saved.verifier });
  } catch (e) {
    log.error("cf_oauth_exchange_failed", { userId: user.id, err: e });
    return back("error");
  }

  try {
    const svc = customDomainService();
    // Re-fetch the domain server-side (never trust the cookie's host as the record source): confirm it
    // still belongs to this pod and get the exact records we already show manually.
    const domains = await svc.listForPod(saved.slug);
    const domain = domains.find((d) => d.hostname === saved.host);
    if (!domain) return back("error");
    const records = svc.dnsRecordsFor(domain).map((r) => ({ type: r.type, name: r.name, value: r.value }));

    const result = await writeCustomDomainRecords(token, domain.hostname, records);
    if (!result.ok) {
      log.warn("cf_oauth_write_failed", { userId: user.id, reason: result.reason });
      return back(result.reason === "not_on_cloudflare" ? "notzone" : result.reason === "scope" ? "scope" : "error");
    }

    // Records are in DNS now — kick verification so the wizard flips to "Verifying"/"Live" sooner.
    try {
      await svc.verify(domain.id);
      await svc.refreshCert(domain.id);
    } catch {
      /* best-effort; the wizard's own poll will pick it up regardless */
    }
    return back("ok");
  } catch (e) {
    log.error("cf_oauth_write_error", { userId: user.id, err: e });
    return back("error");
  }
}
