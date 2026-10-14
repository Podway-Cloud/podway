/**
 * Canonical-host policy for the web app. The app has ONE canonical origin —
 * `podway.io` (matching BETTER_AUTH_URL) — so better-auth's origin/cookie checks and
 * the session cookie are never split across hosts. Landing on the wrong host with an
 * apex-scoped cookie is what triggered `INVALID_ORIGIN` on GitHub sign-in.
 *
 * Domain split (2026-09): the APP lives on `podway.io`; `podway.cloud` is reserved for
 * UNTRUSTED user content only — pod previews (`<slug>.podway.cloud`), custom domains,
 * the gateway — so the login cookie never touches a domain that serves pod-controlled
 * pages. This function therefore sends every APP host that ISN'T the canonical one to
 * `podway.io`: the now-previews-only `podway.cloud` apex/www, and any `www.`. Preview subdomains never reach here — Fly routes `<slug>.podway.cloud`
 * to the gateway, not to this app — so a blanket `*.podway.cloud` rule is unnecessary and
 * we match only the exact app aliases.
 *
 * Returns the host to redirect to, or null when the host is already canonical
 * (or is a host we shouldn't touch, e.g. *.fly.dev, localhost).
 */
// The pre-rename podbay.cloud is back as a redirect (owner, 2026-10-14): Fly certs for it and www on
// podway-web, DNS → podway-web. Retired 2026-09-06 when its cert had never been issued.
const APP_ALIAS_HOSTS = new Set([
  "podway.cloud",
  "www.podway.cloud",
  "www.podway.io",
  "podbay.cloud",
  "www.podbay.cloud",
]);

export function canonicalRedirectHost(host: string | null | undefined): string | null {
  if (!host) return null;
  // Strip any port for the comparison but preserve it on the rewrite.
  const [name, port] = host.split(":");
  const withPort = (h: string): string => (port ? `${h}:${port}` : h);
  // Any non-canonical app host → the canonical app origin, podway.io.
  if (APP_ALIAS_HOSTS.has(name)) return withPort("podway.io");
  // Fallback: collapse a stray `www.` to its apex (e.g. a future app host).
  if (name.startsWith("www.")) return withPort(name.slice(4));
  return null;
}
