# Design — custom domains (Option A)

## The four pieces
A request to `https://app.customer.com` reaching a pod needs: (1) a **DNS pointer** to our ingress,
(2) **ownership proof**, (3) a **TLS cert**, (4) **Host routing** to the pod. The gateway already does
(4) for `*.preview.podway.cloud`; this adds (1)–(3) and extends (4).

## Data model
`custom_domains` (new table, `packages/db`):
- `id`, `pod_id` (FK), `owner_id`
- `hostname` (unique, lowercased, punycode for IDN)
- `record_type` — `cname` (subdomain, default) or `a` (apex)
- `status` — `pending` → `verifying` → `active` → `error`; plus `disabled`
- `verify_token` (the TXT challenge value), `verified_at`
- `cert_status` — `none` / `issued` / `renewing` / `failed`, `cert_not_after`
- `created_at`, `last_checked_at`, `error` (nullable, human-readable)

All columns nullable/additive → backward-compatible for both editions (edition-parity rule 1), though
the feature is cloud-gated.

## The owner flow
1. Owner opens a pod → **Add domain** → enters `app.customer.com`.
2. We create a `custom_domains` row (`pending`) with a `verify_token` and show **exact** records:
   - Subdomain: `CNAME app.customer.com → cname.podway.cloud`
   - Apex: `A customer.com → <anycast-ip>` (we recommend a subdomain first)
   - Ownership: `TXT _podway-challenge.app.customer.com → <verify_token>`
3. Owner adds them at **their** DNS provider (any).
4. **Verification poller** (control-plane) resolves the CNAME target + the TXT; on match → `verifying`
   → request a cert → on issue → `active`. Failures set `error` with a plain reason; the poller backs
   off and the UI shows "still waiting for your DNS…".

## TLS: on-demand at the gateway
Rather than pre-issuing a cert per domain, the gateway edge issues **on first use**:
- A TLS terminator (Caddy/Traefik with **on-demand TLS**, or an ACME lib embedded in the gateway) sits
  at the edge. On an inbound ClientHello with SNI `app.customer.com`:
  - It calls an **ask endpoint** (`GET /internal/tls-allowed?host=…`) → 200 only if the hostname is an
    `active` (or `verifying`) `custom_domains` row. This gate is critical: it stops random Hosts from
    triggering cert issuance and blowing the Let's Encrypt rate limit.
  - On 200, issue a Let's Encrypt cert (**TLS-ALPN-01** or **HTTP-01**), cache it (shared store so it
    survives a gateway redeploy — DB/Fly volume/Cloudflare KV-equivalent), serve the handshake.
- **Renewal** is automatic (the terminator renews ~30 days before expiry). `cert_status` /
  `cert_not_after` mirror it for the UI.
- **Rate limits** (Let's Encrypt: 50 certs/registered-domain/week, 5 duplicate/week, 300 new-orders/3h):
  the ask-gate + a per-owner cap + caching keep us well under. On a limit hit, mark `error` and retry
  with backoff; never hot-loop issuance.

**Why not pre-issue?** On-demand needs no per-domain gateway config or restart, scales to many rarely
-hit domains, and pairs naturally with the Host-routing lookup we already do.

## Host routing
Same as preview routing: gateway reads the terminated request's `Host`, looks up `custom_domains` →
`pod_id` → proxies to that pod's `:3000` over the existing pod network path. The lookup is cached with a
short TTL and busted on domain add/remove/pod-move.

**Lifecycle**: if the mapped pod is suspended, gone, or unhealthy, serve a small **parked page**
(200 with a "this app is paused/unavailable" body, or 503) — never a dead socket or a default cert
error. Destroying a pod cascades its `custom_domains` to `disabled` (and offers reassignment).

**Visibility**: a custom domain is **public** — it does not carry the owner-only preview gate. This is a
new state distinct from `*.preview.podway.cloud` (which is private-by-default). The pod's own preview
visibility setting is independent.

## Ingress prerequisite (the one real infra task)
On-demand TLS needs a **stable ingress the owner can point at**:
- `cname.podway.cloud` — a stable hostname for subdomain CNAMEs, resolving to the gateway edge.
- A **stable anycast IP** for apex A-records. On Fly, a dedicated (anycast) IPv4/IPv6 on the edge app.
- The edge must accept TLS for arbitrary SNI (on-demand), not just `*.podway.cloud`.
Decide edge placement: (a) Caddy/Traefik in front of the current gateway on Fly, or (b) on-demand ACME
inside the gateway process. (a) is less code and battle-tested for on-demand TLS; (b) is fewer moving
parts. Recommend (a) for v1.

## Edition parity
Cloud-only. All new endpoints/UI self-gate behind `!editionOss()`; self-host owners front their pods
with their own proxy. The DB migration is additive and harmless on self-host (unused).

## UX (confirmed with owner, mockup 2026-09-01)
- **A row in Settings, directly under Preview access.** One row carries the whole lifecycle; the dot +
  label read the state at a glance: `none` → "Set up domain…"; `verifying`/`active`/`error` all show
  the hostname + a status tag and the **same "Manage" button** (no separate "view records").
- **The button opens a WIZARD PAGE, not a modal** — like the GitHub / add-agent wizards. Steps:
  *Add domain* → *DNS records* → *Verify*. Durable state makes it resumable.
- **"Manage" opens the same wizard prefilled with the current domain, editable** — one page for setup
  and edit.
- **Apex domains**: the DNS step shows an **A record** (`acme.com → <anycast-ip>`) alongside the
  subdomain CNAME, in a callout — a CNAME can't sit at the root.
- The Set-up/Manage button is a **plain outline** (not the sky enable-tint).

## Alternatives considered
- **Cloudflare for SaaS (Custom Hostnames)** — Option B. CF issues certs + proxies to our origin; we
  call one API. Least ops, but per-hostname cost + CF edge lock-in. Kept as a fallback if running
  on-demand TLS ourselves proves painful.
- **`cloudflared` tunnel per pod** — rejected. Tunnels are for no-public-IP origins; a per-pod tunnel is
  a fragile process on ephemeral pods (dies on restart) and doesn't do multi-tenant Host routing.
- **OAuth into the owner's DNS provider** — rejected as the base: N per-provider integrations,
  whole-zone permissions, and most registrars lack good APIs. A later "auto-add the CNAME for you"
  convenience, Cloudflare-token first.

## Risks
- Let's Encrypt rate limits under abuse → the ask-gate + per-owner cap + caching are the mitigation.
- Cert store durability across gateway redeploys → shared/persistent store, not local disk.
- Apex domains are genuinely awkward → recommend subdomains; A-record path for apex only.
- A dangling domain (owner's CNAME still points at us after they remove the pod) → serve parked page,
  reap `disabled` rows.
