## Context

`/sys/kernel/mm/ksm/run=1` on podbay-box-1, yet `general_profit` ≈ 130MB. Each pod VM's
`/run/incus/<vm>/qemu.conf` defines `[object "mem0"] qom-type = "memory-backend-memfd"`, `share = "on"`.
KSM scans only MADV_MERGEABLE private anonymous memory; a MAP_SHARED memfd is skipped, so guest RAM is
never merged (a normal pod: 2,761 merged pages ≈ 11MB, flat). Incus uses a shared memfd so devices such
as virtiofs can map guest memory; pod-base VMs use none (home is a block volume, no virtiofs/9p mounts).

Measured with `raw.qemu.conf` = `[object "mem0"]\nshare = "off"` (scratch pods, deleted after):
- Boots normally; `incus exec`, pod-agent, dev server, Claude CLI all work.
- Idle 1GiB VMs: ~600MB merged each.
- nextjs-starter 2GiB pods (dev server serving :3000, Claude CLI running): ~1.13GB merged per pod after
  ~4.5 min; box `general_profit` ~1.44GB for 4GB of VMs (~35%). Mostly-idle; busy pods save less.

## Goals / Non-Goals

**Goals:** make pod guest RAM mergeable on every instance-creating path; no forced restarts.

**Non-Goals:** KSM tuning (`pages_to_scan`, `use_zero_pages`) — later, once measured fleet-wide;
self-host (Docker has no guest RAM); freezing idle pods (24/7 by design).

## Decisions

- **`raw.qemu.conf` section override** (Incus merges it into the generated qemu.conf) over a global
  Incus profile: per-instance, visible in `incus config show`, and applied through the same config
  object the provider already builds. A profile would also hit non-pod instances (builder VMs, CI).
- **Apply on create + resize + updateImage**, not a live `incus config set` on running pods: the setting
  only takes effect on a VM start, and restarting customer pods is not ours to do. Pods migrate as they
  Update.
- **One shared constant** for the override so all three paths cannot drift.

## Risks / Trade-offs

- A future pod device that needs shared guest memory (virtiofs share, vhost-user) would fail to start
  → mitigation: the requirement names the constraint; the incus-provider test pins the override so a
  change is deliberate.
- Private guest RAM is anonymous and swappable, and box RSS accounting shifts from "shared" to
  anonymous → watch `free`/swap on the box for a week after rollout; roll back by dropping the key on
  the next recreate.
- KSM CPU cost (ksmd) rises as it has real work → currently `pages_to_scan=2000`/`200ms`; watch ksmd CPU.
