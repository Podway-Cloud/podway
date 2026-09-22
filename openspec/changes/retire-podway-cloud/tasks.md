# Tasks — retire podway.cloud

## 1. Phase 1 prep — cert + DNS for podway.site (additive, nothing breaks)
- [ ] 1.1 `fly certs add '*.podway.site' -a podway-gateway` (and `podway.site` if apex is used); capture the DNS-01 validation target.
- [ ] 1.2 Via `CLOUDFLARE_API_TOKEN`: add `*.podway.site` CNAME → `podway-gateway.fly.dev` (DNS only), plus the `_acme-challenge` validation record. Wait for `fly certs show '*.podway.site'` = Issued.

## 2. Phase 1 code — preview host move (dual-domain safe)
- [x] 2.1 Fix the 2-label heuristic in `packages/gateway/src/main.ts` (appOrigin, relayConnectUrl) and `packages/provider/src/pod-init.ts` (appOrigin): derive correctly when the base has no `preview.` label.
- [x] 2.2 `allowedDevOrigins`: add `*.podway.site` (keep `*.preview.podway.cloud` until teardown) in `environments/morning-ops-robot/app/next.config.ts`, `environments/first-10-customers/app/next.config.ts`, AND the pod-base scaffolder that emits these for new app-pods.
- [x] 2.3 Swap example/UI hostnames: `apps/web/app/landing-agent-home.tsx`, `apps/web/app/dev-harness/preview/page.tsx`, `apps/web/components/preview-card.tsx`.
- [ ] 2.4 Update preview-host tests to podway.site: `packages/provider/test/{pod-init,base-image,podway-cli-surfaces,incus-provider}.test.ts`, `apps/web/test/term-links.test.ts`, `packages/gateway/test/relay-tunnel-router.test.ts`. Prove they fail against the old value.
- [ ] 2.5 Build + test (`pnpm -r build && pnpm -r test`, web `tsc`), commit, and rebuild pod-base (bakes the scaffolder + pod-init changes); digest bump.

## 3. Phase 1 flip + verify
- [ ] 3.1 Set `PODWAY_PREVIEW_BASE=podway.site` on `podway-gateway` + `podway-web` (Fly secrets).
- [ ] 3.2 Confirm reconcile re-stamps existing pods' pod-spec preview URL from the new base (heal path); force a reconcile if needed.
- [ ] 3.3 Verify on a test pod: `https://<slug>.podway.site` → 200; `podway preview` prints the .site URL; a real pod terminal + preview still work.

## 4. Phase 2 — move the rest off podway.cloud
- [ ] 4.1 Gateway: `fly certs add gw.podway.site`; DNS `gw.podway.site` → gateway; set `PODWAY_RELAY_CONNECT_URL=wss://gw.podway.site` (gateway + web `fly.toml` + secret); fix the hardcoded fallback in `apps/web/lib/relay-actions.ts`. Verify a live pod terminal reconnects.
- [ ] 4.2 Session cookie `.podway.cloud` → `.podway.site` (or drop cross-domain now that app+previews split io/site — check `packages/auth/src/bridge-token.ts`, `packages/auth/src/index.ts`).
- [ ] 4.3 Custom-domain CNAME target `cname.podway.cloud` → `cname.podway.site` (`custom-domain-config.ts`, `cloudflare-dns.test.ts`); add the `cname.podway.site` DNS record; plan re-pointing any existing customer domains.
- [ ] 4.4 App/admin/invite URLs + email addresses → podway.io: `packages/auth/src/notify.ts`, the `PODWAY_PUBLIC_URL`/`BETTER_AUTH_URL` defaults (`packages/auth/src/index.ts`, `packages/gateway/src/main.ts`), `apps/web/fly.toml` (`itzhak@`), `LICENSE` (`licensing@`).
- [ ] 4.5 Infra/CI: `.github/workflows/deploy.yml` gw healthcheck; `scripts/check-certs.sh` `CERT_HOSTS`; the domain docs (`domain-*`, `url-structure.md`, `deploy.md`, `shipping.md`).

## 5. Phase 3 — teardown
- [ ] 5.1 Remove `podway.cloud`/`www.podway.cloud` from `apps/web/lib/canonical-host.ts` `APP_ALIAS_HOSTS`.
- [ ] 5.2 `fly certs remove` the podway.cloud + `*.preview.podway.cloud` + `gw.podway.cloud` certs once nothing resolves there; delete the podway.cloud DNS; park/cancel the domain.
- [ ] 5.3 Grep gate: `grep -rn 'podway\.cloud'` (excl. archived openspec changes + historical changelog fixtures) = 0.
