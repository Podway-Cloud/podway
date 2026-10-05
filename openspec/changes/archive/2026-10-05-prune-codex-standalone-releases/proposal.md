# Proposal — prune Codex standalone releases (disk leak)

## Why
Reported by the test:1 pod (christian-dormouse), 2026-09-23, with clear diagnosis: the Codex
standalone updater accumulates release dirs and never removes old ones.
- `~/.codex/packages/standalone/releases` = 5.1G across 16 dirs (~320M each), one new every 2-3 days.
- Only TWO are referenced: `current` symlink and the `auto-update-version` file. The other 14
  (~4.4G) are dead weight. (Contrast: `~/.claude` = 13M, does not accumulate.)
- With a 3.8G `~/.swapfile`, codex releases + swap alone = 8.9G of a 9.8G volume.

## Why it's worse than "disk a bit full"
- `podway doctor` flags `[critical] Disk is low` but `--fix` CANNOT reclaim it (recovered ~94M). The
  sanctioned repair does not resolve the sanctioned diagnosis — a rule-following agent is left stuck.
- At <200M free, writes fail — including `~/.podway/handoff/*.md` (the restart-survival note) and
  pod data files. A pod that cannot write its handoff note loses state on the next Update.
- Projection: ~5.1G / 5 weeks means a fresh 9.8G volume is exhausted by codex releases alone in
  ~2 months with no user action.

## What
1. Prune on update (primary): after a successful standalone install, delete releases that are neither
   `current` nor the pending `auto-update-version`; keep N=2 (one rollback).
2. `podway doctor --fix`: reclaim unreferenced codex releases (it already detects low-disk; make it
   able to act on the actual cause).
3. Revisit the 3.8G swapfile default on a 9.8G volume — likely too large a fixed reservation.

## Scope / non-goals
- Codex standalone updater + `podway doctor` only. Not the Claude tooling (it doesn't leak).
- Ships on pod-base (needs an image build + digest bump) → existing pods get it on their next update.

## Impact
Stops the slow disk-fill that silently breaks handoff/state persistence on codex pods.
test:1 is left intact at 98% as a live reproduction case (owner's request).
