# Retire the podway.cloud domain

## Why

`podway.cloud` is being torn down. Today it carries live traffic — pod previews
(`<slug>.preview.podway.cloud`), the gateway endpoint (`gw.podway.cloud`, pod terminals + relay), the
cross-domain session cookie (`.podway.cloud`), the custom-domain CNAME target (`cname.podway.cloud`),
and outbound email links/addresses. If the domain simply stops resolving, all of that breaks. We must
move every use off it FIRST, verify, then retire it. The app/marketing site already lives on
podway.io; this change moves the remaining infra to **podway.site** (previews + gateway) and podway.io
(email/app URLs).

## What Changes

- Pod preview host `<slug>.preview.podway.cloud` → **`<slug>.podway.site`** (owner: velsa).
- Gateway endpoint `gw.podway.cloud` → **`gw.podway.site`**.
- App/admin/invite URLs and email addresses on `podway.cloud` → **podway.io** (podway.site is
  previews/infra ONLY — no email).
- Custom-domain CNAME target `cname.podway.cloud` → `cname.podway.site`.
- Remove the `podway.cloud`/`www.podway.cloud` redirect hosts + Fly certs + DNS; leave podway.io alone.
- Fix a latent bug: a `preview.`-label-strip heuristic (`split(".").length > 2`) derives wrong values
  for the 2-label `podway.site` — see design.

Delivered in phases so nothing breaks: (1) previews → podway.site, (2) everything else off .cloud,
(3) teardown. Each phase verified on a real pod before the next.

## Capabilities

### New Capabilities
- none

### Modified Capabilities
- none — this is an infra/config migration. No spec REQUIREMENT changes: the specs describe the
  behavior domain-agnostically ("the podway edge", "the gateway", "a preview URL"), never a literal
  host. `skip_specs: true` is set in `.openspec.yaml`.

## Impact

- **Out of repo (I run):** a Fly wildcard cert `*.podway.site` + `gw.podway.site` on `podway-gateway`;
  Cloudflare DNS on the podway.site zone (via the existing `CLOUDFLARE_API_TOKEN`, zone active); Fly
  secret flips (`PODWAY_PREVIEW_BASE`, `PODWAY_RELAY_CONNECT_URL`, cookie domain, app URL defaults).
- **Code/config:** `packages/gateway/src/main.ts`, `packages/provider/src/pod-init.ts` (2-label
  heuristic); `packages/gateway/fly.toml`, `apps/web/fly.toml` (relay-connect URL); `apps/web/lib/relay-actions.ts`
  (hardcoded gateway fallback); `apps/web/lib/canonical-host.ts` (redirect hosts); `packages/auth`
  (cookie domain + notify URLs + public-URL defaults); `custom-domain-config.ts`; the two app scaffolds'
  `allowedDevOrigins` + the pod-base scaffolder; example URLs (`landing-agent-home.tsx`, dev-harness);
  `scripts/check-certs.sh`, `.github/workflows/deploy.yml`; LICENSE/emails; the domain docs.
- **Tests:** the preview/gateway host assertions move with the runtime (`packages/provider/test/*`,
  `apps/web/test/{term-links,canonical-host,cloudflare-dns}.test.ts`, `packages/gateway/test/*`).
- **Existing pods:** each has its preview URL stamped in its pod-spec (still podway.cloud); reconcile
  must re-stamp from the new `PODWAY_PREVIEW_BASE`.
- **Requires a pod-base rebuild** (the CLI/scaffolder + pod-init changes are baked into the image).
- Full inventory: previously drafted in `docs/runbooks/podway-cloud-teardown.md` (folded into this
  change; that runbook is deleted).
