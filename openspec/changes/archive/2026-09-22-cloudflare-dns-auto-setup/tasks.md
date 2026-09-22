# Tasks — "Connect Cloudflare" one-click DNS setup (OAuth v1)

## 0. One-time platform registration (owner/ops — blocks real-user use)
- [x] 0.1 Register a Cloudflare OAuth client (Manage Account → OAuth clients): redirect URI
  `https://podway.io/api/cloudflare/oauth/callback`, DNS-edit + zone-read scopes. Store
  `CLOUDFLARE_OAUTH_CLIENT_ID` + `CLOUDFLARE_OAUTH_CLIENT_SECRET` as Fly secrets.
- [ ] 0.2 Verify podway.io with Cloudflare so the app can be public (verified publisher on consent).

## 1. OAuth flow (server-side, confidential client)
- [x] 1.1 `GET /api/cloudflare/oauth/start?slug=&host=`: build the authorize URL (scopes, PKCE S256,
  signed `state`+verifier in a short-lived cookie carrying slug+host), redirect to Cloudflare.
- [x] 1.2 `GET /api/cloudflare/oauth/callback`: verify `state`, exchange the code (client secret) for an
  access token, then run the record write. Node runtime; the token never reaches the client.
- [x] 1.3 Confirm the exact DNS scope from `GET /client/v4/oauth/scopes`; request least scope.

## 2. Cloudflare API client + write
- [x] 2.1 `resolveZone(domain, token)` (`GET /zones?name=`) and `upsertRecord(zoneId, token, {type,name,
  content,proxied})` (find-by-name+type → `PUT` else `POST`). Errors mapped to typed results, never
  echoing the token.
- [x] 2.2 Write the CNAME (`proxied:false`) + the `_podway-challenge` TXT idempotently; correct a
  flipped-proxied CNAME on re-run. Then kick the existing verification poll.
- [x] 2.3 Token handling per design D3: use-and-drop in v1 (no persistence); if ever stored, encrypted +
  revocable (out of scope here).

## 3. Wizard UI
- [x] 3.1 Add a "Connect Cloudflare" button on the DNS-records step (cloud-only), beside the manual
  records. Click → `/api/cloudflare/oauth/start`.
- [x] 3.2 On return: success → advance to Verify; failure (not on Cloudflare, scope declined, API error)
  → show the typed reason, keep the manual records visible.

## 4. Verify + tests
- [x] 4.1 Unit-test the API client against fixtures: zone resolve (hit/miss), upsert (create/update),
  proxied-CNAME corrected, wrong-scope → typed error, token never in any error/log.
- [x] 4.2 Callback safety test: bad/missing `state` rejected; code exchange mocked.
- [ ] 4.3 Manual-fallback e2e: no/failed Connect → manual records still shown + usable.
- [ ] 4.4 Live check against a real Cloudflare account (owner-side): consent → records written, CNAME
  DNS-only, re-run idempotent, HTTPS issues.

## Recorded, NOT built here (v2 / separate)
- [ ] R.1 Persisted, encrypted OAuth token for auto-renewal / continuous re-verification / auto-fixing a
  flipped-proxied CNAME.
- [ ] R.2 Other providers (Route 53, GoDaddy, Namecheap, …) — each its own integration; manual stays the
  fallback.
- [ ] R.3 API-token paste flow — explicitly rejected (moves the chore to the user).
