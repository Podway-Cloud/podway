## Why

**Status (2026-09-01): the FIRST slice shipped; the larger direction stays PARKED pending velsa.**
This proposal originally sat here purely as a captured idea, deliberately spec-less. Since then the
concrete first slice — n8n as the flagship app-pod — was actually built and merged to main, ahead of
this change catching up: an "Apps" tab (`kind: app`) in the create-a-pod catalog, the n8n environment
(`environments/n8n/`), Docker baked into the Incus/cloud pod-base image so an app-pod can run
`docker compose`, the edition divergence recorded (self-host omits Docker — app-pods are deferred
there), and a maintenance script (`environments/n8n/bin/app-admin.sh`) giving the admin agent atomic
snapshot / safe-upgrade / automatic-rollback. That slice's spec coverage now lives in the MAIN specs
it touches — `openspec/specs/dashboard/spec.md` (the Apps tab), `openspec/specs/environment-spec/spec.md`
(`kind: app`), `openspec/specs/pod-boot/spec.md` (Docker-in-image + data survival), and
`openspec/specs/self-host/spec.md` (the edition divergence) — plus this change's own
`specs/app-maintenance-engine/spec.md` delta for the snapshot/rollback engine, which had no spec home
yet. This change no longer needs a `design.md` or further deltas for that slice; it is DONE.

**Everything below this point is still the ORIGINAL, unbuilt, parked direction** — velsa greenlit
exploring it but has not approved building past the n8n proof-of-concept, and nothing else here may be
implemented until he says so explicitly: generalizing the pattern to more apps (Cal.com, Ghost,
Chatwoot, …), a productionized trust model (upstream CVE/Renovate monitoring, SAFE-vs-RISKY upgrade
classification beyond a manual `safe-upgrade <tag>` call), scheduled/unattended maintenance, and the
positioning decision (see *Impact* below — unresolved).

The growth pod (`moderate-peacock-59a7`) proposes positioning Podway as **"your own AI admin that
deploys and maintains self-hosted OSS apps for you — talk to it in Claude; run on our cloud or your
own hardware"**, beachhead = indie devs / small teams, competing with Coolify-style services,
PikaPods and Elestio.

Two things make this a genuinely new product direction rather than an extension, both verified
against the repo on 2026-08-27:

- **Self-host today deploys Podway itself, nothing else.** The `curl | sh` → `docker compose up`
  path stands up the single-tenant dashboard + control plane on `LocalProvider`. There is no app
  catalog and no third-party app deployment anywhere in the codebase (no n8n / Ghost / Plausible /
  uptime-kuma references at all).
- **The closest existing concept is `environments/`** — five *agent workspace templates*
  (byo-project, doc-qa, first-10-customers, morning-ops-robot, nextjs-starter), each a prebuilt app
  plus skills plus a pre-authed agent. That is a different thing from hosting someone's OSS app, but
  it is the machinery a catalog would most plausibly grow out of, so any design should start there
  rather than from zero.

Current positioning is **agent-led** since 2026-08-10 ("Give Claude a real home"), which explicitly
superseded an environment-led lead. `docs/strategy/positioning.md` records that the env-marketplace
framing "needed a paragraph to land" where agent-led landed in one line — relevant prior art, because
an app-catalog story risks the same failure mode.

## What Changes

**Shipped (2026-09-01):** the n8n proof-of-concept end to end on the cloud/Incus edition — the Apps
catalog tab, the n8n environment (Postgres + n8n via `docker compose`, encryption-key generated
per-pod, private preview), Docker baked into the pod-base image with data on the persistent home
volume, and the `app-admin.sh` maintenance engine (snapshot / safe-upgrade / automatic rollback /
key-guard — see `specs/app-maintenance-engine/spec.md`). This is the "the demo is the product" flow
proven for one app, on one edition.

**Still proposed, still parked** by the growth pod (`moderate-peacock-59a7`) — nothing below may be
implemented until velsa says so explicitly:

- **A trust model, treated as the #1 objection.** Monitor upstream (Renovate) → auto-apply SAFE
  patches → ASK before risky ones (major / breaking / migrations) → one-click rollback. Today's
  `safe-upgrade <tag>` is a manually-invoked, single-app mechanism with no upstream-monitoring or
  SAFE/RISKY classification — the promise "never breaks your stack" needs that automation to be true
  unattended, not just when explicitly invoked.
- **Both modes as a toggle** (Podway cloud / your own box). Self-host is currently EXCLUDED (Docker
  cannot nest inside a self-host pod — see `openspec/specs/self-host/spec.md`), so this is unbuilt.
- **Catalog generalization** beyond n8n: Cal.com, Ghost, Chatwoot, Mautic, Umami, NocoDB, Twenty,
  Listmonk, Uptime-Kuma — each currently would need its own hand-authored environment + maintenance
  script, matching n8n's pattern; no generalized "app-kind engine" exists yet.

## Capabilities

### New Capabilities

- `app-maintenance-engine` (this change's own delta, `specs/app-maintenance-engine/spec.md`) — the
  snapshot / safe-upgrade / atomic-rollback / key-guard mechanism proven by n8n's
  `bin/app-admin.sh`. Scoped strictly to what is actually built and verified; generalizing it into a
  reusable per-app-kind engine (rather than a script authored per environment) is UNBUILT and stays
  part of the parked direction below, not this delta.

For the REMAINING parked direction: naming further capabilities here (e.g. a catalog-wide
`app-catalog` capability, or splitting deploy/lifecycle/rollback apart) would imply a design that has
not been reviewed. A future `design.md` decides that shape, and it should follow the open questions
under *Impact* below, not precede them.

### Modified Capabilities

None from this change directly — the n8n slice's touches to `self-host`, `dashboard`, `pod-boot` and
`environment-spec` were already folded into those MAIN specs directly (see *Why* above), not carried
as this change's own deltas. Note for whoever picks up the remaining parked direction: those same four
surfaces are the ones most likely to change again as the catalog generalizes beyond n8n, and per
`.claude/rules/edition-parity.md` anything touching them is a two-edition event (cloud + OSS) — that
rule is load-bearing for a feature whose whole pitch is "our cloud or your box".

## Impact

Unresolved, and deliberately so. What must be settled BEFORE any build:

1. **Relationship to the agency design-partner sprint.** `docs/strategy/agency-design-partner-sprint.md`
   is marked *"Decision: selected by velsa on 2026-08-16"*, status *"ready for owner review; no
   outreach sent"*. It targets boutique automation consultants and positions Podway as
   **complementing** n8n/Make — adjacent ground, a different beachhead, overlapping machinery. These
   two directions need reconciling by velsa, not by an agent picking one.
2. **Positioning conflict.** This would be a THIRD framing after env-led → agent-led. Whether it
   replaces, layers under, or targets a separate segment is velsa's call.
3. **The trust promise is the hard engineering, not the demo.** "Never breaks your stack" means
   automated upgrade classification, migration-aware rollout, verified rollback, and backup/restore
   that genuinely works — for arbitrary third-party apps. The demo flow is the cheap half.
4. **Operational surface.** Hosting other people's OSS apps means their CVEs, their data, their
   backups, and their uptime expectations. That is a materially different liability profile from
   "an always-on machine for coding agents" and should be costed before, not after.
5. **No adoption baseline exists.** No installs / stars / signup figures are recorded anywhere in the
   repo, and the waitlist form was removed (CTA is GitHub sign-in). Any sizing claim needs velsa's
   own numbers.

Sequencing per velsa (2026-08-27): the larger direction stays parked until the existing
fix/branch/PR/test cleanup is finished. (The n8n proof-of-concept slice above shipped inside that same
cleanup window as a small, scoped, already-decided piece of app-catalog machinery — it does not
resolve any of the open questions above, which remain velsa's to decide before the direction expands
past n8n.) See `0asks.md` for what is still owner-gated.
