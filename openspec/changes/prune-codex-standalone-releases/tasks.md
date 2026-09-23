# Tasks — prune Codex standalone releases (disk leak)

## 1. Investigate / confirm
- [x] 1.1 Found the install path: `~/.codex/packages/standalone/{releases/<ver>-x86_64-unknown-linux-musl, current, auto-update-version}`; updater is `agent_update_codex` in `packages/provider/pod-base/podway`.
- [x] 1.2 Referenced set confirmed on the test:1 repro = `current` symlink target + `auto-update-version` content; the other 14 dirs are prunable.

## 2. Prune on update (primary fix)
- [x] 2.1 Added `_codex_prune_releases` (keep current + pending, delete the rest; fail-safe when current can't resolve); called at the end of `agent_update_codex`. `packages/provider/pod-base/podway`.
- [x] 2.2 Fail-safe guards: never prune when `current` is unresolved or dangling; `set -euo pipefail`-safe. Exposed hidden `podway __prune-codex-releases <dir>` for reuse + tests.

## 3. doctor --fix reclaim
- [x] 3.1 `check_disk` under `--fix` now calls `podway __prune-codex-releases "$CODEX_SA_DEST"` (single source of truth). `packages/provider/pod-base/podway-doctor`.
- [x] 3.2 disk-low finding now names the codex-release cause (CLI detail names `podway doctor --fix`; owner-facing detail stays command-free per the cockpit rule).

## 4. Swapfile default
- [ ] 4.1 OWNER DECISION: the 3.8G `~/.swapfile` on a 9.8G volume is a lot of fixed reservation. Reducing it risks OOM under load. Leaving as-is pending velsa's call (not changed tonight).

## 5. Ship + verify
- [x] 5.1 Unit tests: `packages/provider/test/codex-prune.test.ts` (keeps current+pending, honours no-pending, two fail-safe paths, no-op on empty). 52/52 in the provider CLI/doctor suite pass.
- [ ] 5.2 Build pod-base via `build-and-record.sh` + digest bump — NEEDS owner yes (ask-before-image-build).
- [ ] 5.3 Verify on the test:1 repro: prune reclaims ~4.4G; `doctor` clears the finding; handoff note writes. (Repro currently kept intact per owner.)
