# Design: Size-based, RAM-anchored pod pricing

## Context

Today capacity + cost live in `apps/web/lib/fleet.ts` as **slots**: `slotsForSize` maps a tier's RAM
to slots (1 slot = 4 GB), the box has `PODWAY_BOX_SLOTS` (default 40), and per-pod cost is a pod's
slot-share of the box price. `@podway/shared/tiers.ts` defines three sizes (s/m/l) with `cpus`,
`memoryGb`, `diskGb`; `control-plane` enforces a `slot_limit`. There is **no customer-facing price**
and **no billing** yet — this change introduces both, pre-Alpha.

The real box (read off the machine): Ryzen 9 3900 (24 threads), 128 GB RAM, 1.66 TB NVMe (ZFS pool
`podbay`), €160/mo. Its RAM:disk ratio is ~1:13; disk is currently ~5× under-allocated relative to
RAM. All numbers, the cost floor, and the InstaPods benchmark live in `docs/strategy/pricing-model.md`.

## Goals / Non-Goals

**Goals:**
- One legible model: a pod's price is a flat monthly function of its **size**, nothing else.
- Sizes anchored to RAM, with CPU + disk allocated in the box's natural ratio so RAM and disk fill up
  together (no wasted disk).
- A cheap suspended state that actually frees the expensive box (not just the RAM).
- A signup credit + referral that are generous but abuse-resistant and cost-capped.
- Ship incrementally: the sizing/capacity change is useful on its own, before billing exists.

**Non-Goals:**
- Usage/metered billing, bandwidth charges, awake-hours (all explicitly dead).
- A free-forever tier (rejected — the credit covers "try it free").
- Self-host billing (self-host has no per-pod price).
- Retroactively resizing or re-pricing existing pods without owner action.

## Decisions

**D1 — Tier table is the single source of truth; price is a field on it.**
Extend `@podway/shared/tiers.ts` `POD_TIERS` to 5 sizes and add `monthlyUsd` (and a derived
`suspendedUsd`). Everything — launch, cockpit, capacity, billing — reads the table. Alternative
(separate pricing config) rejected: it splits size and price into two places that drift.

| size | RAM | vCPU (burst) | disk | $/mo |
| --- | --- | --- | --- | --- |
| mini | 1 | 1 | 12 | 4 |
| s | 2 | 2 | 25 | 7 |
| m *(default)* | 4 | 2 | 50 | 12 |
| l | 8 | 4 | 100 | 22 |
| xl | 16 | 6 | 180 | 42 |

**D2 — Capacity = RAM budget, not slots.** Replace `PODWAY_BOX_SLOTS`/`slotsForSize`/`slot_limit`
with a sellable-RAM budget (`PODWAY_BOX_RAM_GB`, host reserve subtracted) and admission on summed
pod RAM. The fleet view reports RAM sold vs budget + revenue, not slots. CPU is burstable (overcommit,
never a hard admission gate); disk is checked against the ZFS pool free space. Rationale: RAM is the
real density constraint; slots were a proxy that also hid the disk headroom.

**D3 — Default size becomes Medium (4 GB).** `control-plane` currently defaults to Small. A 1 GB Mini
can't run the prebuilt Next build + in-pod Postgres, and even 2 GB is tight, so the default that makes
the out-of-box experience work is 4 GB. Mini/Small are opt-in for light workloads.

**D4 — Suspend archives the volume off-box; resume restores it.** New provider behavior: on suspend,
`zfs send` the pod's dataset to cold storage (a Hetzner Storage Box / object store) and free it from
the pool; on resume, `zfs receive` it back and boot. This is what makes the $1/mo suspended rate
honest — a suspended pod no longer occupies expensive NVMe. Alternative (in-place stop, keep the
volume) rejected: it leaves disk — the scarce resource — squatted, so "very cheap suspend" wouldn't be
affordable. Trade-off: resume is slower (a restore, not an instant wake) — acceptable for a suspended
pod, and surfaced in the UI as "restoring…".

**D5 — Billing/credit/referral are their own phase, gated behind sizing.** The tier + capacity +
default-size change (Phase 1) ships with no dependency on a payment processor. Flat-monthly billing,
the card-on-file credit, and the referral (Phase 2) and suspend-archive (Phase 3) follow. The spec
states the target behavior; `tasks.md` phases the build so Phase 1 is mergeable alone.

**D6 — Cloud-only, self-gated.** Every price/billing surface checks `!editionOss()`; the tier table's
resource fields still apply to self-host (they size the container) but its `monthlyUsd` is never shown
or charged there.

## Risks / Trade-offs

- **Raising disk defaults on existing pods** → we only raise defaults for NEW pods and for an explicit
  resize; `diskGb` is a grow-only quota, so existing pods are untouched until their owner resizes.
- **suspend→archive adds real infra** (cold storage, send/receive, failure handling) → land it as its
  own phase behind a flag; until it ships, suspend keeps today's in-place behavior and the $1 rate is
  not yet offered.
- **Card-on-file + credit invites abuse** (miners, throwaway accounts) → require a card to claim
  credit, cap free-credit pods to Mini–Medium, egress-limit, one free-credit pod per verified account.
- **Referral fraud** (self-referral) → credit only after the referred account keeps a *paid* pod ~30
  days, and only with a distinct card/identity.
- **Overcommit miscalibration** (CPU/RAM) → RAM admission is a hard budget; KSM dedup (~1.5–2×) is
  upside we don't sell against; CPU stays burstable with monitoring, not a promise.

## Migration Plan

1. **Phase 1 (this ship):** add Mini/XL + prices + RAM-anchored disk to `POD_TIERS`; swap slots→RAM
   budget in `fleet.ts` + `control-plane`; default → Medium; update launch/cockpit copy. No billing.
   Existing pods keep their size; no resize.
2. **Phase 2:** flat-monthly billing + card-on-file + signup credit + referral (cloud-only).
3. **Phase 3:** suspend→archive-off-box + the $1 suspended rate.
- **Rollback:** Phase 1 is config/UI + a capacity-accounting swap — revert the commit; no data
  migration. Phases 2–3 are flag-gated and roll back by disabling the flag.

## Open Questions

- Exact host RAM reserve for `PODWAY_BOX_RAM_GB` (8 vs 12 GB) — measure under load.
- Cold-storage target + per-GB cost for the archive (Hetzner Storage Box vs object store).
- Payment processor (Stripe assumed) and where the credit ledger lives.
- Billing grain for the first partial month (day vs hour proration).
