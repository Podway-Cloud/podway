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
// The pre-rename hosts are deliberately ABSENT. Their redirect could never run anyway: the
// certificate was never issued, so TLS fails before any request reaches this code and an old link
// dies at the handshake. Keeping the entries only implied a fallback that does not exist. Owner
// retired the domain outright (2026-09-06).
const APP_ALIAS_HOSTS = new Set([
  "podway.cloud",
  "www.podway.cloud",
  "www.podway.io",
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
