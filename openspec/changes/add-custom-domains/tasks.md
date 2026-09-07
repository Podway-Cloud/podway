# Tasks — custom domains (Option A)

## 0. Infra prerequisite (do first — unblocks everything)
- [ ] 0.1 Stand up a stable edge that accepts on-demand TLS for arbitrary SNI: Caddy/Traefik in front
  of the gateway on Fly (recommended) OR embedded ACME in the gateway.
- [ ] 0.2 Provision `cname.podway.cloud` (stable CNAME target) + a dedicated anycast IPv4/IPv6 for apex
  A-records on the edge app.
- [ ] 0.3 Provision a persistent cert store that survives edge redeploys (Fly volume / shared KV / DB).

## 1. Data model (`packages/db`)
- [x] 1.1 `custom_domains` migration: id, pod_id, owner_id, hostname (unique), record_type, status,
  verify_token, verified_at, cert_status, cert_not_after, created_at, last_checked_at, error — all
  additive/nullable (edition-parity).
- [x] 1.2 Schema + types in `packages/db/src`, matching the SQL; confirm self-host migrate path applies
  it harmlessly.

## 2. Control-plane (`packages/control-plane`)
- [x] 2.1 Domain CRUD (add/list/remove) with hostname validation (FQDN, punycode, not already claimed),
  cloud-gated.
- [x] 2.2 `verify_token` generation + the record instructions the UI shows.
- [x] 2.3 Verification poller (verify logic + on-demand re-check; background scheduler wired with the edge): resolve CNAME target + TXT challenge; drive `pending → verifying →
  active`, with backoff + human-readable `error`.
- [x] 2.4 Domain→pod lookup for the gateway (cached, busted on add/remove/pod-move).
- [ ] 2.5 Cascade: pod destroy/suspend updates domain state.

## 3. Gateway (`packages/gateway`)
- [ ] 3.1 On-demand TLS wired to the edge (or embedded), with the **ask endpoint**
  `GET /internal/tls-allowed?host=` → 200 only for registered active/verifying hostnames.
- [ ] 3.2 Host routing for custom domains → mapped pod `:3000` (reuse preview routing).
- [ ] 3.3 Parked/503 page for suspended/gone/unhealthy pods; never a dead socket or cert error.
- [ ] 3.4 Rate-limit safety: per-owner issuance cap + backoff on Let's Encrypt failures.

## 4. Dashboard (`apps/web`)
- [x] 4.1 "Add domain" flow on the pod cockpit: input, the exact records to add, copy buttons.
- [x] 4.2 Status UI: `pending → verifying → active → error`, a "verify now" nudge, cert expiry, remove.
- [x] 4.3 Cloud-gate the whole surface behind `!editionOss()`.

## 5. Verify + ship
- [ ] 5.1 e2e: add a domain (fake DNS resolver in the harness), drive to active, route a request, remove.
- [ ] 5.2 Real-domain manual check on a test pod: a throwaway subdomain end-to-end (CNAME → cert →
  route → parked page on suspend).
- [ ] 5.3 Docs: a runbook for the edge/anycast setup + the owner-facing "add your domain" help.
- [ ] 5.4 `openspec validate add-custom-domains --type change` and archive on ship.
