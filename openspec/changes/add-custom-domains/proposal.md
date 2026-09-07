# Add custom domains (Option A: CNAME + on-demand TLS at the gateway)

## Why
Today a pod's app is only reachable at `*.preview.podway.cloud`. Owners who want to run a real,
public product — a self-hosted app (n8n), a site, an API — need to serve it on **their own domain**
(`app.customer.com`). Custom domains turn a pod from "a preview" into "a thing you ship", and are
table stakes for the app-pods direction.

This proposal is the **cloud-only** custom-domain feature, built the way every mainstream PaaS builds
it (Vercel/Fly/Render/Heroku): the owner adds one DNS record pointing at us, we verify ownership,
auto-issue and renew TLS, and the gateway routes by `Host` to their pod. It works with **any** DNS
provider because the owner just adds a CNAME — no OAuth into their DNS, no per-provider integration.

## What changes
- **A new `custom-domains` capability**: owners map a hostname to one of their pods, prove they own
  it, and serve it over HTTPS with an auto-managed certificate.
- **Dashboard**: an "Add domain" flow on a pod — enter `app.customer.com`, get the exact DNS record to
  add, watch it go `pending → verifying → active`, remove it later.
- **Gateway**: **on-demand TLS**. On the first TLS handshake for an unknown hostname, an "ask" endpoint
  checks the domain is registered + active; if so a Let's Encrypt cert is issued on the fly and cached,
  and the request is routed to the pod's `:3000` — the same Host-routing the preview already does.
- **DNS verification**: a poller confirms the owner's CNAME (and a TXT ownership challenge) resolve
  before a domain goes `active` and before any cert is requested.
- **Lifecycle + visibility**: a custom domain is **public** by definition (different from the owner-only
  preview default). A suspended/destroyed pod serves a clean parked/503 page on its domain, not a dead
  connection.

## Non-goals (v1)
- **No OAuth into the customer's DNS** (Cloudflare/Route53/etc.) — the owner adds the CNAME themselves.
  Auto-adding the record via a DNS provider's API is a **later** convenience layer, not the base.
- **No Cloudflare for SaaS** — that is the buy-vs-build alternative (Option B); this proposal builds TLS
  + edge on the gateway we already run. (Kept as a documented fallback in design.md.)
- **No apex-domain magic beyond an A-record path** — recommend a subdomain; support apex via an
  A-record to a stable anycast IP. CNAME-flattening/ALIAS is out.
- **No self-host edition support** — self-host owners bring their own reverse proxy. Gated behind
  `!editionOss()`.
- **No wildcard custom domains, no per-domain redirects/headers config** — one hostname → one pod.

## Impact
- **New**: `custom-domains` spec capability; `custom_domains` table (`packages/db`); gateway on-demand
  TLS + ask/verify endpoints (`packages/gateway`); control-plane domain CRUD + verification poller
  (`packages/control-plane`); dashboard UI (`apps/web`).
- **Touches shared surfaces** (edition-parity): DB schema (additive, nullable), control-plane, gateway,
  web — all cloud-gated. See design.md for the ingress/anycast-IP prerequisite, which is the one piece
  of real infra work.
