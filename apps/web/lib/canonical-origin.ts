/**
 * The app's PUBLIC origin, for building a URL a browser will actually follow.
 *
 * Never derive a redirect from the request's own host/origin on a deployed app. Behind Fly's proxy
 * Next resolves `req.nextUrl.origin` to the INTERNAL bind address, so the browser is sent to
 * `https://0.0.0.0:3000/…` and lands on a dead page.
 *
 * This has now bitten twice: the GitHub OAuth callback (2026-08-31) and the preview sign-in bounce
 * (2026-09-06, which is why the in-cockpit preview showed a broken page). The first was fixed in
 * place; the second repeated it because the fix lived in one file as a local expression rather than
 * as something callers could reach for. Hence this helper.
 *
 * `BETTER_AUTH_URL` is the right source: it is the domain the session and OAuth callbacks are
 * registered under, so a redirect built from it always lands where auth actually works. The
 * request-host fallback keeps local dev and self-host working, where no canonical URL is configured.
 */
export function canonicalOrigin(headers: {
  get(name: string): string | null;
}): string | null {
  const configured = process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const host = headers.get("host");
  if (!host) return null;
  // A bind address is never a host a browser can reach — refuse rather than build a dead URL.
  if (/^(0\.0\.0\.0|\[::\]|::)(:\d+)?$/.test(host)) return null;
  return `${headers.get("x-forwarded-proto") ?? "https"}://${host}`;
}
