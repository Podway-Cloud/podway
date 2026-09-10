# Tasks — size-based, RAM-anchored pod pricing

Phased so **Phase 1 is mergeable on its own** (no billing dependency). Phases 2–4 are flag-gated.

## 1. Phase 1 — tiers, capacity, default (ships alone, no billing)

- [x] 1.1 `@podway/shared/tiers.ts`: `PodSize` extended to `"mini" | "s" | "m" | "l" | "xl"`;
  `POD_TIERS` remapped to the RAM ladder + a `monthlyUsd` per tier + `SUSPENDED_USD` (flat 1).
- [x] 1.2 `@podway/shared/tiers.ts`: `DEFAULT_POD_SIZE` → `"m"`; `POD_SIZES` updated; `slotsForSize`
  removed (replaced by `ramGbForSize`); union widening broke no switches.
- [ ] 1.3 `apps/web/lib/fleet.ts`: box-level RAM-budget + revenue view. DEFERRED — kept `slots` as the
  INTERNAL admin/box density metric (not user-facing); a box-global RAM-budget admission is Phase-1b.
- [x] 1.4 `packages/control-plane`: per-account **slot budget → RAM budget** (`accountRamUsage`,
  `assertRamFits`, `ACCOUNT_RAM_GB`); `slot_limit` error → `capacity_limit`; default size → Medium.
  (Box-global admission = Phase-1b; this is the per-account cap.)
- [x] 1.5 `packages/provider`: each size's `diskGb` comes from the tier table via `resolveResources`
  (unchanged mechanism; the new disk figures flow through, grow-only).
- [x] 1.6 Launch flow: `size-picker` shows all five sizes + `$X/mo`, Medium default; the launch
  wizard's budget line reads GB (RAM), not slots. Cloud-only prices (self-host uses host-chooser).
- [ ] 1.7 Sync the delta specs to `openspec/specs/` + update `docs/strategy/pricing-model.md`.
  DEFERRED — the delta specs are authored in this change; sync on `opsx:apply`/archive.
- [x] 1.8 Tests: RAM-budget admission rewritten (`account-ram-budget.test.ts`), resize/default tier
  values updated (`service.test.ts`, `resize-handoff.test.ts`), migration `--> statement-breakpoint`
  fixed. Green: control-plane 427, web 336, shared 95; web tsc clean; launch wizard screenshot verified
  (5 sizes + prices + GB budget line). Live-overflow/box-global admission still Phase-1b.

## 2. Phase 2 — flat-monthly billing + signup credit + referral (cloud-only, flag-gated)

- [ ] 2.1 Data model: an account billing record + a credit ledger + a per-pod charge stream
  (`packages/db` migration, backward-compatible/nullable).
- [ ] 2.2 Payment integration (Stripe assumed): card-on-file capture; no charge without a card.
- [ ] 2.3 Flat-monthly charge accrual per running pod, first partial month prorated; deleting a pod
  stops accrual. All gated behind `!editionOss()`.
- [ ] 2.4 Signup credit: grant $12–15 on card-added; offset charges until exhausted; cap free-credit
  pods to Mini–Medium; NO free-forever path.
- [ ] 2.5 Referral: give/get $10; referrer's credit deferred until the referred account keeps a PAID
  pod ~30 days on a distinct card/identity.
- [ ] 2.6 Add the `pod-pricing` spec to `openspec/specs/`; tests for proration, credit exhaustion,
  referral deferral, and the no-card/no-credit path.

## 3. Phase 3 — suspend → archive off-box + the $1 suspended rate (flag-gated)

- [ ] 3.1 `packages/provider`: on suspend, `zfs send` the pod's dataset to cold storage and free it
  from the pool; on resume, `zfs receive` it back and boot. Interruption-safe (failed archive leaves
  the pod resumable in place, no data loss).
- [ ] 3.2 Control-plane lifecycle: suspend releases the pod's RAM from the box budget and switches its
  billed rate to the flat suspended rate; resume re-checks the budget and restores.
- [ ] 3.3 Cockpit: surface resume as a "restoring…" in-progress state (resume is no longer instant).
- [ ] 3.4 Tests: archive/restore round-trip preserves data, failed-archive leaves pod resumable,
  suspended pod bills the flat rate and frees the budget.

## 4. Phase 4 — rollout

- [ ] 4.1 Choose the host RAM reserve (`PODWAY_BOX_RAM_GB`) from a real under-load measurement.
- [ ] 4.2 Pick the cold-storage target for the archive (Hetzner Storage Box vs object store) + cost.
- [ ] 4.3 Migrate existing pods' size labels to the new tiers (Small→Small etc.); no retroactive
  resize or re-price without owner action.
- [ ] 4.4 Verify end-to-end on cloud (deployed) and confirm self-host shows sizes without prices.
