/**
 * Custom domains (add-custom-domains): validate + classify a hostname the owner wants to point at
 * their pod. The hostname is opaque, user-supplied text (a form field / a stored column), so it is
 * normalized + validated at every write path, never trusted as-is — a bad value is treated as
 * ABSENT (null), and callers reject rather than store it.
 */

export const HOSTNAME_MAX_LEN = 253;

// A public DNS hostname: dot-separated labels, each 1–63 chars of [a-z0-9-] not starting or ending
// with a hyphen, at least two labels (a bare "localhost" is not a public domain). Punycode (xn--…)
// passes since it is plain [a-z0-9-]. IDNs must be punycode-encoded before this.
const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const HOSTNAME_RE = new RegExp(`^(?:${LABEL}\\.)+${LABEL}$`);

/**
 * Normalize a hostname from user input: lowercase, trim, and forgive a pasted URL (strip
 * scheme + any path) or a trailing dot. Returns null for anything that isn't a valid public FQDN.
 */
export function normalizeHostname(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let h = raw.trim().toLowerCase();
  h = h.replace(/^https?:\/\//, "").replace(/[/?#].*$/, ""); // a pasted URL → just the host
  h = h.replace(/\.$/, ""); // trailing dot
  if (h.length === 0 || h.length > HOSTNAME_MAX_LEN) return null;
  return HOSTNAME_RE.test(h) ? h : null;
}

/**
 * True when the hostname is a root/apex domain (no subdomain) — which can't take a CNAME, so the
 * setup wizard shows an A record instead. A label-count heuristic; multi-part public suffixes
 * (`co.uk`) are the known imperfection, fine for a DISPLAY hint (DNS verification is authoritative).
 */
export function isApexHostname(hostname: string): boolean {
  return hostname.split(".").length <= 2;
}

/** The DNS record type we ask the owner to add for a hostname: `a` for apex, `cname` otherwise. */
export function recordTypeFor(hostname: string): "a" | "cname" {
  return isApexHostname(hostname) ? "a" : "cname";
}
