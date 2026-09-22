# Design: "Connect Cloudflare" — one-click DNS setup (OAuth)

## Context

Custom domains work manually today (CNAME + `_podway-challenge` TXT, then a poller verifies + issues
HTTPS). Cloudflare's **self-managed OAuth clients** (GA 2026-06-03) let a third-party app request DNS
scopes and have users authorize it via a consent screen — so we can offer a real "Connect Cloudflare"
one-click that writes the records, with no token chore. Manual entry stays the fallback for every other
provider. (An API-token-paste flow was considered and rejected: it just moves the chore.)

## Goals / Non-Goals

**Goals**
- One click for a Cloudflare-hosted domain: consent → we write both records → verify. No token.
- Correct + safe: CNAME **DNS-only**, idempotent, least scope, tokens minimally retained.
- Manual entry stays the universal fallback, always visible.

**Non-Goals**
- Other providers' APIs (Route 53, GoDaddy, …). The API-token paste flow. (Both out.)

## Decisions

**D1 — OAuth 2.0 Authorization Code, server-side (client secret).** We are a confidential server app,
so we use the authorization-code flow with our client secret (PKCE too, defense in depth). Cloudflare's
endpoints + scopes come from `GET https://api.cloudflare.com/client/v4/oauth/scopes`; the DNS scope
mirrors the API-token permission name (`dns_records:edit` / zone DNS edit) plus zone read for the
lookup. The consent screen lets the OWNER pick the account/zone and shows our (verified) publisher.

**D2 — One-time platform registration (owner/ops).** Register a Cloudflare OAuth client (redirect URI
`https://podway.io/api/cloudflare/oauth/callback`), store `CLOUDFLARE_OAUTH_CLIENT_ID` +
`_CLIENT_SECRET` as Fly secrets, and **verify podway.io** so the app is public + shows a verified badge
(otherwise only our own account members could authorize). This is the ONE setup step, and it's ours,
not the user's.

**D3 — Token retention: short-lived, minimally kept.** The access token is used to write the records
right after the callback; we do NOT need long-term access. Prefer: use the token for the write, then
drop it (rely on the refresh token only if a retry is needed within the flow). If a stored token is
ever needed (e.g. to re-fix a flipped-proxied CNAME later), it MUST be encrypted at rest + revocable —
but that's a later option, not v1. The RECORDS persist in the zone; our poller verifies from DNS.

**D4 — Callback safety.** The start route sets a signed `state` (+ PKCE verifier) in a short-lived
cookie; the callback verifies `state`, exchanges the code, and never trusts the redirect otherwise.
The callback is `/api/cloudflare/oauth/callback` (web, Node runtime).

**D5 — Idempotent write, CNAME DNS-only.** Resolve the zone (`GET /zones?name=<registrable>`), then
upsert the CNAME (`proxied:false`) + the TXT by exact name+type (find → `PUT` else `POST`). Touch ONLY
our two records. A re-run corrects a CNAME the owner flipped to proxied.

**D6 — Additive UX.** The DNS-records step gains a "Connect Cloudflare" button beside the manual
records. Click → OAuth → on return we write the records → advance to Verify. Any failure (not on
Cloudflare, scope declined, API error) shows the reason and leaves the manual records right there.

## Risks / Trade-offs

- **OAuth token is sensitive** → least scope; used server-side; never logged; encrypted if ever stored;
  the callback is state/PKCE-guarded. → the write happens in one server action; the token never reaches
  the client.
- **App must be public to serve all users** → domain-verify podway.io with Cloudflare (D2); until then
  only our account can test it (fine for build/validation).
- **Owner picks the wrong account/zone at consent** → the zone lookup won't find the domain → clear
  error, manual fallback.
- **Cloudflare API/OAuth changes** (new feature, June 2026) → pin the documented endpoints; keep manual
  as the always-working path.

## Migration Plan

- Additive; no schema change if token is not stored. Ship behind the custom-domain edge gate, cloud-only.
  Rollback = hide the "Connect Cloudflare" button; manual path untouched.
- **Blocked on the one-time platform registration (D2)** before it can serve real users.

## Open Questions

- Exact DNS scope name from `/oauth/scopes` (confirm at build: `dns_records:edit` vs `zone.dns:edit`).
- Store the token (encrypted) for later auto-fixes, or strictly use-and-drop? (Lean: use-and-drop v1.)
- Does public verification need more than domain verification (e.g. review)? Confirm during registration.
