## Context

- Incus 6.0 pod VMs already have `[device "qemu_balloon"] driver = "virtio-balloon-pci"`; guest RAM is a
  shared memfd (`mem0`, `share = "on"`), counted as host `Shmem`.
- `raw.qemu.conf` changes only while a VM is stopped. The provider already writes instance config at
  create / resize / update (`guestMemoryConfig`, reverted to `{}` after the KSM incident).
- pod-agent already knows when an agent turn is running (session state from disk) and runs as root.

## Goals / Non-Goals

**Goals:**
- Freed guest memory returns to the box within a minute.
- Idle pods give back clean page cache too.
- Judged ONLY by whole-box free RAM + swap over hours, pilot first.

**Non-Goals:**
- KSM / memory merging (reverted; separate future work on an anonymous backend).
- Balloon inflation / hard memory reclaim from a busy guest.
- Forced restarts to roll out: pods pick it up on their normal update.

## Decisions

- **Free-page reporting, not balloon inflation.** Reporting only returns memory the guest itself freed;
  it cannot starve a guest. Inflation needs a controller and can.
- **Override only the balloon section.** `guestMemoryConfig` returns
  `raw.qemu.conf = '[device "qemu_balloon"]\nfree-page-reporting = "on"'`. Resize keeps removing any
  old `mem0` override (a pod with the KSM override gets this value instead, which drops `mem0`).
- **Trim = `drop_caches = 1` THEN `compact_memory = 1`.** Pilot 2026-09-28: dropping ~630 MB of cache
  per test pod returned NOTHING to the host — the guest reports only whole free 2 MB blocks
  (`page_reporting_order` = 9), and cache frees leave scattered 4 KB holes. Compacting afterwards
  returned 773 MB (test:1); lowering `page_reporting_order` to 0 returned 807 MB (test:2). Compaction is
  chosen: one-off cost at idle, versus reporting every 4 KB free forever. `drop_caches = 1` = clean page
  cache only (never dirty data); not `3`.
- **Reporting alone does nothing for an idle pod** (4 h pilot: test pods flat at 2.7/2.4 GB, same as
  the control) — the trim is what makes overcommit hold; reporting is what hands the result to the host.
- **Idle = no agent turn AND 1-min load < 0.3 for 15 min; at most once per 60 min.** Constants in one
  place; tune after the pilot. Logged (`guest_cache_trimmed`, MB freed from MemAvailable delta).
- **Pilot on test:1/test:2** with the override set by hand while stopped, before the provider change
  reaches customers.

## Risks / Trade-offs

- [Cache miss after a trim — the next build re-reads files] → only when idle, at most hourly.
- [Reporting overhead: page faults when the guest re-uses reported pages] → small; measured in pilot
  (build time on a test pod with vs without).
- [Another memory surprise like KSM] → whole-box `MemAvailable`, `Shmem`, swap logged before/after on
  the pilot for hours; the change is one config key, reversible on the next update.
- [Older guest kernels without reporting] → feature is negotiated; no reporting ⇒ same as today.
