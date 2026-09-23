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
- [x] 4.1 OWNER DECISION (2026-09-23): keep swap at `min(RAM,4G)` (don't shrink — OOM risk), but stop it eating the user's quota. Moved to its own change: `openspec/changes/swap-on-top-of-disk-quota` (volume = tier disk + swap). The test:1 anomaly (3.8G/9.8G = 39%) was a mis-sized test pod, not a real tier (real tiers are 2–8%).

## 5. Ship + verify
- [x] 5.1 Unit tests: `packages/provider/test/codex-prune.test.ts` (keeps current+pending, honours no-pending, two fail-safe paths, no-op on empty). 52/52 in the provider CLI/doctor suite pass.
- [ ] 5.2 Build pod-base via `build-and-record.sh` + digest bump — NEEDS owner yes (ask-before-image-build).
- [x] 5.3 Verified on the test:1 repro 2026-09-23: prune reclaimed 4.4G (disk 99%→52%), kept current+pending, `codex --version` still 0.155.1. With 4.5G free, doctor's disk-low finding clears and handoff writes succeed. (Ran the new script via a temp push; NOT yet baked into the image — 5.2.)
