## Why

The box must run pods at 2x RAM overcommit (the business model), but today memory is wasted in three
ways, measured 2026-09-30: (1) ZFS ARC caches each pod's home disk a second time on the host (24 GB now,
allowed to grow to 63 GB) although the guest already caches it; (2) KSM merges almost nothing (0.14 GB)
because Incus backs guest RAM with a shared memfd, so the same kernel, programs and image files sit in
RAM once per pod; (3) a busy pod keeps its whole page cache (makore.app prod: 12.3 GB of 16 GB is cache)
and nothing takes it back when the box needs RAM. The 2026-09-25 KSM attempt (`share = "off"` on the
memfd) doubled pod RAM; this change does it with the right backend and whole-box measurement.

## What Changes

- **Box ZFS ARC:** home volumes cache only metadata in ARC (`primarycache=metadata` on
  `podbay/custom`, inherited by new volumes); image and root-disk blocks stay cached (clones share them,
  so one ARC copy serves every pod on that image). `zfs_arc_max` is capped at 16 GiB. Live, reversible,
  codified in `scripts/incus/bootstrap-box.sh`.
- **Guest RAM is private and mergeable:** the provider's `raw.qemu.conf` sets `mem0` to
  `memory-backend-ram` (anonymous, `merge = "on"`) instead of Incus's `memory-backend-memfd share=on`,
  and keeps free-page reporting on the balloon. KSM can then merge identical pages across pods. Pods get
  it on their next create / resize / owner-clicked Update. Pilot on test pods only.
- **Pressure reclaim:** a box watcher (`podway-mem-pressure`, systemd on the host) acts ONLY when host
  available memory is below a threshold. It asks the pods holding the most page cache to reclaim a few GB
  through the guest's own cgroup v2 `memory.reclaim`, so the guest's LRU drops its coldest pages first
  and hot cache stays. Freed pages return to the box through free-page reporting. Starts in dry-run
  mode (log only). No timed trimming of busy pods.
- Removes the stale `ksm-private-guest-memory` change (the reverted `share=off` approach).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `sandbox-provider`: pod guest memory moves from "keep Incus's default backing" to an anonymous,
  KSM-mergeable backend; the box's ARC policy and the pressure-reclaim watcher become spec'd box
  behavior.

## Impact

- `packages/provider/src/incus/provider.ts` (`guestMemoryConfig`) + `packages/provider/test/incus-provider.test.ts`.
- `scripts/incus/bootstrap-box.sh` (ARC cap, `primarycache`, KSM tuning, watcher unit);
  new `scripts/incus/box/mem-pressure.sh`.
- Box host (podbay-box-1): live ZFS parameters and a new systemd unit. No pod restarts from phase 1 or 3.
- Needs a gateway deploy for the provider change (owner yes). No pod-base image, no DB migration.
- Cloud only. Self-host `LocalProvider` (Docker) has no guest RAM and no ZFS box; unaffected.
- Safety: podway dev (`everyday-harrier-ae1b`, the captain pod) and all owner pods are never restarted
  by this work; VM-level changes are piloted on `test:1` / `test:2` only.
