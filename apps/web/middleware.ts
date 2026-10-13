import { NextResponse, type NextRequest } from "next/server";
import { canonicalRedirectHost } from "@/lib/canonical-host";
import {
  ACTIVE_LANDING_EXPERIMENT,
  chooseLandingVariant,
  crawlerLandingVariant,
  isCrawler,
  isLandingVisitorId,
  isVariantForExperiment,
} from "@/lib/landing-experiment-config";
import { REF_COOKIE, REF_COOKIE_MAX_AGE, sanitizeRef } from "@podway/shared";
import { getHomepageTrafficCached } from "@/lib/homepage-traffic";

const LANDING_EXPERIMENT = ACTIVE_LANDING_EXPERIMENT;

/**
 * Force the canonical apex host: redirect `www.podway.cloud` → `podway.cloud`.
 * Keeps every request on the origin that matches BETTER_AUTH_URL + the
 * `.podway.cloud` cookie, so a `www` visit can't produce `INVALID_ORIGIN` at
 * sign-in. 308 preserves method/body for any non-GET that slips through.
 */
export async function middleware(req: NextRequest) {
  const res = await route(req);
  // First-touch ref (see REF_COOKIE): remember ?ref= from ANY page, unless an earlier one is stored.
  const ref = sanitizeRef(req.nextUrl.searchParams.get("ref"));
  // Only a real page load (or a client without sec-fetch-*). Next's link prefetch is a fetch() of a
  // ?ref= link before any click and stamped visitors who never followed it. Next strips its own
  // router headers (next-router-prefetch, rsc) before middleware runs, so sec-fetch-dest is the
  // signal. A client-side click is a fetch too; /start carries the ref in its own URL.
  if (ref && !req.cookies.get(REF_COOKIE) && req.headers.get("sec-fetch-dest") !== "empty") {
    res.cookies.set(REF_COOKIE, ref, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: REF_COOKIE_MAX_AGE,
    });
  }
  return res;
}

async function route(req: NextRequest): Promise<NextResponse> {
  const apex = canonicalRedirectHost(req.headers.get("host"));
  if (apex) {
    const url = req.nextUrl.clone();
    // Set hostname (not host) and clear the port explicitly: nextUrl carries the
    // internal listen port (3000) behind fly-proxy, and the `host` setter keeps a
    // pre-existing port — which would leak `podway.cloud:3000` into the redirect.
    const [hostname, port = ""] = apex.split(":");
    url.hostname = hostname;
    url.port = port;
    return NextResponse.redirect(url, 308);
  }

  if (req.nextUrl.pathname === "/selfhost/signin") {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.search = "";
    const response = NextResponse.redirect(url);
    // A standalone /selfhost visitor must not be credited to whatever homepage arm they once saw — but
    // a visitor IN the selfhost arm signs in through here too, and must keep their attribution.
    if (req.cookies.get(LANDING_EXPERIMENT.cookie.variant)?.value !== "selfhost") {
      response.cookies.delete(LANDING_EXPERIMENT.cookie.variant);
      response.cookies.delete(LANDING_EXPERIMENT.cookie.visitor);
    }
    return response;
  }

  // A DIRECT visit to /agent-computer counts for the agent-computer landing (owner, 2026-10-12): it can
  // get traffic of its own even at 0% of the home page split. The visitor is tagged with the landing
  // they actually saw, so the page's exposure beacon and their later sign-up / pod count for it.
  if (req.nextUrl.pathname === "/agent-computer") {
    if (isCrawler(req.headers.get("user-agent")) || !isVariantForExperiment(LANDING_EXPERIMENT, "agent-computer")) {
      return NextResponse.next();
    }
    const response = NextResponse.next();
    const opts = landingCookieOptions(req);
    response.cookies.set(LANDING_EXPERIMENT.cookie.variant, "agent-computer", opts);
    if (!isLandingVisitorId(req.cookies.get(LANDING_EXPERIMENT.cookie.visitor)?.value)) {
      response.cookies.set(LANDING_EXPERIMENT.cookie.visitor, crypto.randomUUID(), opts);
    }
    return response;
  }

  if (req.nextUrl.pathname !== "/") return NextResponse.next();

  const requestHeaders = new Headers(req.headers);
  const crawler = isCrawler(req.headers.get("user-agent"));
  if (crawler) {
    // Crawlers see what most people see (never a different product): crawlerLandingVariant.
    requestHeaders.set(
      LANDING_EXPERIMENT.requestHeaders.variant,
      crawlerLandingVariant(await getHomepageTrafficCached(), LANDING_EXPERIMENT),
    );
    requestHeaders.set(LANDING_EXPERIMENT.requestHeaders.eligible, "0");
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const storedVariant = req.cookies.get(LANDING_EXPERIMENT.cookie.variant)?.value;
  const storedVisitor = req.cookies.get(LANDING_EXPERIMENT.cookie.visitor)?.value;
  // The admin's live traffic (cached ≤15s; null on a DB error → the coded split). In "one landing"
  // mode a NEW visitor gets that landing but NO variant cookie, so switching back to a split assigns
  // them fairly; a returning visitor's cookie is kept (page.tsx serves the one landing regardless).
  const traffic = await getHomepageTrafficCached();
  const sticky = isVariantForExperiment(LANDING_EXPERIMENT, storedVariant);
  const oneLanding = traffic?.mode === "one" ? traffic.one : null;
  const variant = isVariantForExperiment(LANDING_EXPERIMENT, storedVariant)
    ? storedVariant
    : oneLanding ?? chooseLandingVariant(Math.random(), LANDING_EXPERIMENT, traffic?.weights);
  const visitorId = isLandingVisitorId(storedVisitor) ? storedVisitor : crypto.randomUUID();

  requestHeaders.set(LANDING_EXPERIMENT.requestHeaders.variant, variant);
  requestHeaders.set(LANDING_EXPERIMENT.requestHeaders.visitor, visitorId);
  requestHeaders.set(LANDING_EXPERIMENT.requestHeaders.eligible, "1");
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const cookieOptions = landingCookieOptions(req);
  if (!sticky && !oneLanding) {
    response.cookies.set(LANDING_EXPERIMENT.cookie.variant, variant, cookieOptions);
  }
  if (!isLandingVisitorId(storedVisitor)) {
    response.cookies.set(LANDING_EXPERIMENT.cookie.visitor, visitorId, cookieOptions);
  }
  return response;
}

// Run on everything except Next internals and static assets.
function landingCookieOptions(req: NextRequest) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: LANDING_EXPERIMENT.cookie.maxAgeSeconds,
  };
}

export const config = {
  // Node runtime (stable in Next 15.5): the live split is read from the DB (lib/homepage-traffic.ts).
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};
