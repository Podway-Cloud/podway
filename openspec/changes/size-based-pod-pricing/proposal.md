# Proposal: Size-based, RAM-anchored pod pricing

## Why

The current model prices capacity in abstract "slots" (1 slot ≈ 4 GB RAM, box = 40 slots). It
complicates launch, billing, and the fleet view, and it under-allocates disk badly — pods get only
~2.5 GB disk per GB RAM while the box's real RAM:disk ratio is ~1:13, so ~80% of the 1.66 TB NVMe
sits empty. As we turn on paid billing (pre-Alpha), we want a model an owner understands at a glance
and that packs the box efficiently: **each pod is priced flat by its size, everything anchored to
memory.** Numbers, box economics, and the competitor benchmark are in
`docs/strategy/pricing-model.md` (this change supersedes its slot model).

## What Changes

- **BREAKING: remove the "slot" model.** Delete `slotsForSize`, the `slot_limit` control error, and
  `PODWAY_BOX_SLOTS`. Box capacity becomes a plain **RAM budget** (sellable-GB), not a slot count.
- **Add two sizes** to `@podway/shared` `POD_TIERS`: **Mini** (1 GB / 1 vCPU / 12 GB, a light tier —
  bots, static, scripts; NOT a valid default) and **XL** (16 GB / 6 vCPU / 180 GB).
- **Re-anchor every size to RAM** with CPU + disk in the box's natural ratio (~13 GB disk per GB RAM,
  ~0.5–1 vCPU per GB, burstable): Small 2 GB/25 GB, Medium 4 GB/50 GB, Large 8 GB/100 GB. This
  **raises disk defaults** (currently ~2.5 GB/GB) across the board.
- **Change the default size** from Small to **Medium** (4 GB) so the prebuilt stack — Next build +
  in-pod Postgres — still fits (a 1 GB Mini does not).
- **Each size carries a flat monthly price** (Mini $4 · Small $7 · Medium $12 · Large $22 · XL $42),
  prorated only on the first partial month. No metering.
- **Suspended pods bill a flat $1/mo**, enabled by a NEW **suspend→archive-off-box** step: on suspend,
  move the pod's ZFS volume to cold storage (freeing box RAM/CPU/disk); on resume, restore it.
- **Signup bonus:** a ~$12–15 account **credit** (requires a card on file; spendable on any size;
  free-credit pods capped to Mini–Medium) plus a **$10/$10 referral** granted after the referred
  account keeps a paid pod ~30 days. **No free-forever tier.**
- Cloud-only: self-host has no per-pod billing. Pricing surfaces gate on `!editionOss()`.
- Update the fleet/capacity view (slots → RAM budget + revenue) and any cockpit/launch copy that
  shows sizes or slots.

## Capabilities

### New Capabilities
- `pod-pricing`: what a pod costs and how it is billed — the flat per-size monthly price, the flat
  suspended rate, the signup credit and referral, and the "no free-forever tier" rule. Cloud edition
  only; the price of a size is derived from the RAM-anchored tier table.

### Modified Capabilities
- `launch-config`: the Basics **size** step offers Mini–XL, defaults to **Medium**, and shows each
  size's **price** next to its specs (no slot language).
- `sandbox-provider`: per-size resource allocation follows the RAM-anchored ratio (higher disk), and
  **suspend archives the pod's volume off the box while resume restores it** (a new provider behavior
  distinct from today's in-place suspend).
- `control-plane`: capacity accounting is a **RAM budget, not slots** (removing `slot_limit`); the
  default compute size is **Medium**; and suspend/resume drive the archive lifecycle and switch the
  pod between its running price and the flat suspended rate.

## Impact

- **Code:** `@podway/shared/tiers.ts` (add Mini/XL, prices, drop `slotsForSize`); `apps/web/lib/fleet.ts`
  (slots → RAM budget + revenue); `packages/control-plane` (`slot_limit` removal, default size,
  suspend/resume archive lifecycle, per-pod price/credit records); `packages/provider` (volume
  archive/restore on suspend/resume; disk defaults); launch flow + cockpit copy; new billing/credit
  data model + a payment integration (card on file) — **the billing, archive, and referral pieces are
  large and land as later phases** (see `tasks.md`), gated behind the tier + capacity change which
  ships first.
- **Docs/specs:** supersedes the slot model in `docs/strategy/pricing-model.md`; new
  `openspec/specs/pod-pricing/spec.md`; deltas to `launch-config`, `sandbox-provider`, `control-plane`.
- **Editions:** cloud only; every pricing/billing surface self-gates on `!editionOss()`.
- **Migration:** existing pods keep running; their size maps to the new tier (Small stays Small, etc.).
  No pod is resized or re-priced retroactively without an explicit owner action.
