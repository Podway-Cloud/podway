## Why

The box is RAM-bound (~4–12GB available with 17 pod VMs; a box-wide OOM already killed a CI runner on
2026-09-22). KSM is on but merges almost nothing (~130MB box-wide): Incus backs every VM's RAM with a
**shared** memfd (`memory-backend-memfd`, `share = "on"`), and KSM only merges private anonymous pages.
Measured on scratch pods, making guest RAM private lets KSM reclaim ~35% of pod RAM on a mostly-idle
workload — the largest density lever found, with no pricing or product change. (Freeze/scale-to-zero is
out: Podway is 24/7 by design.)

## What Changes

- Incus pod instances get `raw.qemu.conf` overriding `[object "mem0"] share = "off"`, so guest RAM is
  private and KSM can merge it.
- Applied on every path that creates an instance: launch, resize, and the `updateImage` recreate — so
  existing pods pick it up on their next Update. No forced restarts.
- Folds in `docs/plans/ksm-private-guest-memory.md` (the measurement), then deletes it.
- Cloud (Incus) only. Self-host `LocalProvider` (Docker containers) is unaffected: containers share the
  host kernel's page cache and have no guest RAM to merge.

## Capabilities

### New Capabilities

### Modified Capabilities
- `sandbox-provider`: an Incus pod VM's guest memory is private (mergeable by KSM) on create and on
  every recreate.

## Impact

- `packages/provider/src/incus/provider.ts` — instance config at create, resize, and updateImage.
- `packages/provider/test/incus-provider.test.ts` — asserts the override on each path.
- Box: RSS accounting changes (guest RAM moves from "shared" to anonymous, swappable) — watch box
  memory and swap during rollout.
- No DB migration, no web change, no pod-base image change.
