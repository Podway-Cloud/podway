## 0. Baseline + cleanup

- [x] 0.1 Record the whole-box baseline (MemAvailable, Shmem, AnonPages, swap, ARC size/c_max/hits/misses,
      KSM pages_sharing, ksmd CPU, per-VM RSS) into this change's `baseline.md`; verify: file has all rows
- [x] 0.2 Delete the stale `openspec/changes/ksm-private-guest-memory/`; verify: `openspec list` no longer shows it

## 1. Box ZFS cache (live, reversible)

- [x] 1.1 `zfs set primarycache=metadata podbay/custom`; verify: every `*-home` volume shows it (inherited)
      and root/image datasets still show `all`
- [x] 1.2 Cap ARC at 32 GiB live; after 2 h check hit rate and MemAvailable, then 16 GiB; verify:
      arcstats `c_max` = 16 GiB, `size` ≤ 16 GiB, hit rate and pods healthy
- [x] 1.3 Codify both in `scripts/incus/bootstrap-box.sh` (`/etc/modprobe.d/zfs.conf` + the zfs set);
      verify: `bash -n` passes and the box file matches the script

## 2. Private, mergeable guest RAM

- [x] 2.1 Pilot on test:1 with the incus CLI (stop, set the override, start); verify: generated
      `qemu.conf` shows `memory-backend-ram`, the QEMU process has no memfd mapping, pod `/healthz` OK
- [x] 2.2 Same on test:2; measure both for ≥ 2 h: host memory per VM ≤ guest-touched RAM (no doubling),
      KSM `pages_sharing` rises, whole-box MemAvailable up vs baseline, free-page reporting still returns memory
- [x] 2.3 Test first: provider tests expect the D2 override on launch/resize/update for block homes and the
      balloon-only config for filesystem homes; see them fail on current code
- [x] 2.4 Implement in `guestMemoryConfig`; verify: provider + control-plane suites green
- [x] 2.5 Update `sandbox-provider` spec (this change's delta) and `openspec validate`; verify: passes

## 3. Pressure reclaim watcher

- [x] 3.1 Write `scripts/incus/box/mem-pressure.sh` with a pure selection step testable by a self-check
      (`mem-pressure.sh --selftest`); verify: selftest fails when the selection rule is broken, passes when fixed
- [x] 3.2 Install as `podway-mem-pressure.service` in `dryrun`, exclude `everyday-harrier-ae1b`; install per
      scripts/incus/box/README.md (box units are installed by hand there); verify: unit active, journal shows one dry-run decision per minute
- [x] 3.3 Force a dry-run decision by raising LOW on test pods only; verify: it picks the right pod and
      `on` mode on test:1 frees cache that shows up as host MemAvailable

## 4. Ship (owner yes per step)

- [x] 4.1 PR + merge (spec in the same commit)
- [x] 4.2 Ask: deploy gateway (provider change)
- [x] 4.3 Ask: switch the watcher to `on`
- [ ] 4.4 Owner clicks Update on pods; watch whole-box memory daily via `box-memory-check`
