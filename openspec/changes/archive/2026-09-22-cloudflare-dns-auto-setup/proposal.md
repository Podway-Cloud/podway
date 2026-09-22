# Proposal: "Connect Cloudflare" — one-click DNS setup for custom domains (OAuth)

## Why

Adding a custom domain means the owner hand-copies two DNS records (a CNAME and a `_podway-challenge`
TXT) into their provider — error-prone and off-putting. We already improved the manual UX (copyable
Type/Name/Value). This change removes the chore entirely for the common case: if the domain is on
**Cloudflare**, the owner clicks **"Connect Cloudflare"**, approves on Cloudflare's consent screen, and
we write the records **for** them.

This is possible because Cloudflare shipped **self-managed OAuth clients** (2026-06-03): a third-party
app can register an OAuth client, request DNS scopes, and have users authorize it with a consent screen
— the same model as "Sign in with GitHub/Google". No API token, no copy-paste. (An API-token paste was
considered and REJECTED — telling users to go create a token is exactly the chore we're removing.)

## What Changes

- **NEW: "Connect Cloudflare" button** on the DNS-records step. It runs the **OAuth 2.0 Authorization
  Code** flow (server-side app with a client secret): redirect to Cloudflare → the owner approves the
  DNS-edit scope for the account/zone they pick → we get an access token → we write the records.
- **We write the records automatically:** the CNAME to the podway edge (**`proxied=false`** — DNS only)
  and the ownership TXT, idempotently. On success → jump straight to Verify.
- **Manual records stay** as the universal fallback for every non-Cloudflare provider.
- **Cloud edition only.** The manual path is unchanged.

## One-time platform setup (owner/ops, before build ships)

- Register a Cloudflare **OAuth client** (Manage Account → OAuth clients): redirect URI
  `https://podway.io/api/cloudflare/oauth/callback`, requesting the **DNS-edit** scope (+ zone read).
  Store the client id + secret as Fly secrets.
- **Verify podway.io** with Cloudflare so the app can go **public** (any Cloudflare user can authorize,
  and the consent screen shows a verified publisher) — not just our own account members.

## Capabilities

### New Capabilities
- `cloudflare-dns-auto-setup`: via Cloudflare OAuth, the platform writes a custom domain's required
  records (CNAME DNS-only + ownership TXT) into the owner's Cloudflare zone after they consent — no
  token handling by the user — idempotently, with clear errors, leaving manual entry intact.

### Modified Capabilities
- (none — the manual custom-domain flow is unchanged; the OAuth option is additive.)

## Impact

- **Code (a later apply):** an OAuth start + callback route pair (`/api/cloudflare/oauth/*`, PKCE/state,
  token exchange); a Cloudflare API client (zone lookup + record upsert); the wizard gains a "Connect
  Cloudflare" panel. Access/refresh tokens are handled per the design's minimize-retention rule.
- **Security:** the OAuth token is a sensitive credential — least scope, never logged, encrypted if
  stored, revocable; state/PKCE guard the callback.
- **Non-goals:** other providers (Route 53, GoDaddy, …) — each its own integration, manual stays the
  fallback; the **API-token paste** flow (explicitly rejected).
