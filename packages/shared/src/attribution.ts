/**
 * Deep-link referral attribution (deeplink-onboarding, `/start?app=<slug>&ref=<source>`). `ref` is
 * opaque, user-supplied text lifted straight off a URL — it is attribution data, never trusted
 * markup, so it is validated at every write path (never just once at the edge): length-capped and
 * charset-restricted so it can't carry HTML/script content, blow out the column, or be used to
 * smuggle anything through a value that's stored verbatim and later rendered in an admin view.
 * A value outside that shape is treated as ABSENT (null) rather than rejected loudly — the wrong
 * `ref` is not worth failing a sign-in or a pod launch over.
 */

export const REF_MAX_LEN = 128;

/** Letters, digits, underscore, dot, hyphen — plenty for a campaign/source tag
 * ("hn", "partner-x", "utm.show-hn"), nothing that could read as markup or a path. */
const REF_RE = /^[A-Za-z0-9_.-]{1,128}$/;

/** Validate + normalize a `ref` value from a query param, cookie, or stored column. Returns null
 * for anything missing, oversized, or outside the allowed charset. */
export function sanitizeRef(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, REF_MAX_LEN);
  return REF_RE.test(trimmed) ? trimmed : null;
}
