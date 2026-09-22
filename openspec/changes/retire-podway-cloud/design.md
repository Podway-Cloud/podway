# Design — retire podway.cloud

## Current state (verified 2026-09-22)
- **`podway-gateway`** terminates Fly certs `gw.podway.cloud` + `*.preview.podway.cloud`, and holds
  `PODWAY_PREVIEW_BASE=preview.podway.cloud`. It serves BOTH the pod terminals/relay (gw) and the pod
  previews (`<slug>.preview.podway.cloud` → pod app port). Preview TLS is **Fly-managed** (not the
  Cloudflare edge), so podway.site needs a Fly wildcard cert + DNS that passes Fly's ACME DNS-01.
- **`podway-web`** terminates `podway.io`, `www.podway.io`, `podway.cloud`, `www.podway.cloud` (the
  last two 308-redirect to podway.io via `apps/web/lib/canonical-host.ts`).
- **The preview host is one env var.** Every preview URL is `https://<slug>.<PODWAY_PREVIEW_BASE>`; no
  file hardcodes the domain in that construction. So the move is mostly DNS + cert + env flip.
- podway.site zone is already active in Cloudflare (zone id `138c2d311acf8665af369a69bf20a3d4`), and the
  existing `CLOUDFLARE_API_TOKEN` can edit it.

## Key decisions
- Previews → `<slug>.podway.site` (owner). Gateway → `gw.podway.site` (owner). App/email → podway.io.
  podway.site is previews/infra ONLY — no MX/email on it.
- Dual-run every host during the move (old + new both resolve/served) so nothing breaks mid-flight;
  flip the env var last; retire podway.cloud only after Phases 1–2 verify.

## The one real code hazard — a 2-label base
`preview.podway.cloud` has 3 labels; `podway.site` has 2. Three runtime fallbacks strip the first
label ONLY when `split(".").length > 2`, to turn the preview base into the app root:
`packages/gateway/src/main.ts` (appOrigin ~L312, relayConnectUrl ~L275) and
`packages/provider/src/pod-init.ts` (appOrigin ~L171). With a 2-label base the strip does not fire and
they derive `https://podway.site` / `wss://gateway.podway.site` — WRONG (app is podway.io). They are
FALLBACKS overridden by explicit env (`PODWAY_APP_ORIGIN`, `TRUSTED_ORIGINS[0]`,
`PODWAY_RELAY_CONNECT_URL`) which prod sets, so prod is safe only while those stay set. Fix: make the
derivation robust for a 2-label base (treat the base as the app root when it has no `preview.` label),
so the fallback is never silently wrong. Keep the explicit envs set regardless.

## Cert + DNS approach
- `fly certs add '*.podway.site' -a podway-gateway` (and `gw.podway.site`) → prints the DNS-01
  validation target. Add `*.podway.site`/`gw.podway.site` CNAMEs → `podway-gateway.fly.dev` DNS-only
  (grey cloud — Fly terminates TLS), plus the `_acme-challenge` record, via the Cloudflare API. Wait
  for `fly certs show` = Issued before flipping any env.

## Cutover sequence (why this order)
1. Cert + DNS for podway.site exist and validate (additive, nothing breaks).
2. Code/scaffold/test changes ship + pod-base rebuild (new pods carry the fix; dual-domain
   allowedDevOrigins so old previews still frame).
3. Flip `PODWAY_PREVIEW_BASE=podway.site` → new previews are .site.
4. Reconcile re-stamps existing pods' pod-spec preview URLs (same heal path used for the podbay.cloud
   flip in 0.7.0). Verify a live pod's preview + terminal.
5. Phase 2: move gw + cookie + custom-domain CNAME + email URLs off .cloud, each verified.
6. Phase 3: remove podway.cloud certs/DNS/redirect hosts; grep gate = 0 (excl. archived openspec +
   historical changelog fixtures).

## Rollback
Every step is reversible by re-pointing: flip `PODWAY_PREVIEW_BASE` back, keep the podway.cloud cert/DNS
until the grep gate is clean and a real pod verifies on podway.site. Do not remove a podway.cloud cert
or DNS record until its podway.site replacement is Issued and serving.
