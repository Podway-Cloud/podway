# Tasks — prune Codex standalone releases (disk leak)

## 1. Investigate / confirm
- [ ] 1.1 Find where the codex standalone updater installs releases + how `current` and `auto-update-version` are written (pod-base codex install/update path).
- [ ] 1.2 Confirm the referenced set = `current` symlink target + `auto-update-version` file; everything else under `releases/` is prunable.

## 2. Prune on update (primary fix)
- [ ] 2.1 After a successful standalone install, delete releases not in {current, pending auto-update-version}; keep N=2 (one rollback). Fail-safe: never delete the running one.
- [ ] 2.2 Guard against a partial/failed install (don't prune if the new release didn't verify).

## 3. doctor --fix reclaim
- [ ] 3.1 Teach `podway-doctor --fix` to reclaim unreferenced codex releases (same referenced-set logic). Report bytes reclaimed.
- [ ] 3.2 Make the low-disk finding name the codex-release cause + point at the fix.

## 4. Swapfile default
- [ ] 4.1 Evaluate the 3.8G `~/.swapfile` on a 9.8G volume; pick a smaller default or size it to the volume.

## 5. Ship + verify
- [ ] 5.1 Unit-test the referenced-set/prune logic (prove it keeps current+pending, deletes the rest; prove it fails a partial-install test before the fix).
- [ ] 5.2 Build pod-base via `build-and-record.sh` + digest bump (ask owner first per image-build rule).
- [ ] 5.3 Verify on the test:1 repro pod: prune reclaims ~4.4G; `doctor` clears the finding; handoff note writes.
