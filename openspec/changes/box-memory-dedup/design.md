## Context

Box podbay-box-1: 125 GiB RAM, 8 GiB swap, 2x NVMe in a ZFS pool `podbay`, Incus 6.0, QEMU 8.2, 17 pod
VMs. Baseline 2026-09-30 ~12:00Z: MemAvailable 29 GiB, Shmem (guest memfds) 65 GiB, ARC 23.7 GiB
(c_max 62.9 GiB, hit rate 98.7%), KSM `pages_sharing` 36,755 (0.14 GiB), swap 5.2/8 GiB used.

How pod memory is built today:
- Guest RAM = `[object "mem0"] qom-type = "memory-backend-memfd" share = "on"` (Incus default). KSM
  only merges private anonymous memory, so it cannot merge a shared memfd.
- The provider adds `raw.qemu.conf` with free-page reporting on the balloon (guest-memory-return). That
  works: afisha crawler dropped from 14.9 to 4.1 GiB on the host after its crawl ended.
- Root disk = ZFS clone of the image snapshot (`images/<fp>.block@readonly`). Home = one ZFS zvol per
  pod under `podbay/custom`. `primarycache=all` everywhere.
- Every pod VM here uses a BLOCK home; `qemu.conf` has no virtiofs / vhost-user device (checked on
  test:1), so nothing in the VM needs its RAM to be a shared file.
- Guest kernel 6.8, cgroup v2, `/sys/fs/cgroup/memory.reclaim` present. DAMON is not built in.

Why the 2026-09-25 attempt doubled RAM: it set `share = "off"` but kept `memory-backend-memfd`. A
private mapping of a memfd copies each written page into anonymous memory while the memfd keeps its own
page, so there were two copies. It was judged by merged pages on fresh scratch VMs, not by whole-box
free memory.

## Goals / Non-Goals

**Goals:**
- Each byte of pod data lives in host RAM once: no ARC copy of a home block the guest already caches,
  and one KSM-merged copy of pages that are identical across pods.
- Take memory back from pods ONLY when the box needs it, and let the guest pick its coldest pages.
- Every step reversible in one command and judged by whole-box numbers over hours.

**Non-Goals:**
- No timed trimming of busy pods (rejected by the owner: it slows production pods for no gain).
- No change to promised pod sizes, pricing, or the 2x box gate.
- No virtio-pmem/DAX shared image (bigger rebuild; revisit only if KSM falls short).
- No restarts of podway dev (`everyday-harrier-ae1b`) or any owner pod by this work.

## Decisions

**D1. ARC: `primarycache=metadata` on `podbay/custom`, `zfs_arc_max` = 16 GiB.**
Home data is read by one pod only and the guest caches it itself, so a host copy is pure duplication.
Root/image blocks are shared by every pod cloned from the same image, so ARC keeps ONE copy for all of
them and serves re-reads after a guest drops its cache — keep `all` there. Metadata stays cached for
every dataset (ZFS needs it to find blocks). Set on the parent dataset so new home volumes inherit it.
16 GiB is about 2x what root/image data + metadata needs; ARC can still shrink below it.
Alternative: `primarycache=none` on homes — rejected, ZFS then re-reads indirect blocks from disk on
every access. Alternative: cap ARC only — leaves home data competing with the image blocks.

**D2. Guest RAM: `memory-backend-ram` with `merge = "on"`, set through `raw.qemu.conf`.**
Anonymous private RAM is the only kind KSM merges, and it has no second backing copy, so there is one
page per guest page. QEMU's balloon free-page reporting frees anonymous pages with `MADV_DONTNEED`, so
memory return keeps working. Override: `[object "mem0"] qom-type = "memory-backend-ram"`,
`share = "off"`, `merge = "on"`, plus the existing balloon section. Applied only when the home is a
BLOCK volume (a legacy `filesystem` home needs shared memory for its share); otherwise the balloon-only
config stays. Takes effect when the VM next starts from a stopped state (create / resize / Update).
Alternative: keep memfd and add virtio-pmem for the image — much larger change, deferred.

**D3. KSM settings stay (`run=1`, `pages_to_scan=2000`, `sleep_millisecs=200`) until measured.**
That scans about 40 MB/s. With ~100 GiB mergeable, a full pass takes about 45 minutes, which is
acceptable for long-lived pods. Tune only if ksmd CPU or merge lag is a measured problem.

**D4. Pressure reclaim: a host watcher using the guest's `memory.reclaim`.**
`scripts/incus/box/mem-pressure.sh`, run by `podway-mem-pressure.service` on the host every 60 s:
1. Read host `MemAvailable`. Below `LOW` (12 GiB) → act; otherwise sleep.
2. For each running pod VM, read guest `/proc/meminfo` via `incus exec` (5 s timeout per pod, so a
   frozen VM cannot hang the loop).
3. Pick pods whose page cache is above 25% of their RAM and above 1 GiB, largest first, not reclaimed
   in the last 10 minutes and not on the exclude list.
4. For each, write `min(2 GiB, cache - 1 GiB)` to `/sys/fs/cgroup/memory.reclaim` in the guest. The
   guest's LRU evicts its coldest pages first; free-page reporting hands them to the host.
5. Stop when projected MemAvailable reaches `HIGH` (20 GiB).
Modes: `dryrun` (default, logs what it would do) and `on`. Exclude list (`PODWAY_MEM_PRESSURE_EXCLUDE`)
starts with `everyday-harrier-ae1b` until the owner says otherwise.
Why not the QEMU balloon: its QMP monitor socket is held by Incus, and changing `limits.memory` would
change the pod's promised size. Why not `drop_caches`: it throws away hot and cold cache alike.

## Risks / Trade-offs

- [Home re-reads now hit NVMe instead of ARC] → NVMe reads are ~100 µs; measure ARC hit rate and
  zvol read IOPS before/after; revert with `zfs inherit primarycache podbay/custom`.
- [ARC cap too low slows image re-reads] → watch `arcstats` hits/misses for a day; raise the cap live.
- [Incus rejects or ignores the `mem0` qom-type override] → pilot on test:1 first and read the
  generated `qemu.conf` and `/proc/<pid>/smaps` (anon, not memfd) before anything else.
- [Anonymous guest RAM gets split from THP by KSM → small CPU cost] → compare ksmd CPU and pod latency
  on the pilot; set `merge = "off"` per pod if it hurts.
- [Doubling again] → the pilot gate is the host's own counters: per VM, memfd size = 0 and AnonPages
  rise ≤ what Shmem falls. Any growth beyond that stops the rollout.
- [Watcher removes hot cache] → it acts only under pressure, reclaims at most 2 GiB per pod per 10 min,
  and the guest LRU chooses; dry-run logs are reviewed before `on`.
- [Frozen VM hangs `incus exec`] → 5 s timeout per call; skip the pod.

## Migration Plan

1. Baseline: record host MemAvailable, Shmem, AnonPages, swap, ARC stats, KSM counters, per-VM RSS.
2. Phase 1 (box, live): `primarycache=metadata` on `podbay/custom`; ARC cap in two steps
   (32 GiB, then 16 GiB after 2 h if hit rate and free RAM look right). Durable in
   `/etc/modprobe.d/zfs.conf` via bootstrap-box.sh. Rollback: `zfs inherit primarycache podbay/custom`
   and `echo 0 > /sys/module/zfs/parameters/zfs_arc_max`.
3. Phase 2 pilot: set the D2 override on test:1 and test:2 with the incus CLI (stop, set, start), then
   measure for hours: no doubling, KSM merges between them, whole-box MemAvailable up. Only then merge
   the provider change and ask to deploy the gateway. Existing owner pods get it only when the owner
   clicks Update. Rollback: revert the provider; a resize/update puts back the balloon-only config.
4. Phase 3: install the watcher in `dryrun`, review a day of logs, then `on` with the owner's yes.
