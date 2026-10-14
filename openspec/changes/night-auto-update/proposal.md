## Why

After each image, the owner clicks Update on every pod (today: 8 pods behind, one on 0.8.43). The
dashboard already has "Update N idle pods" (`updatableIdlePods` / `updateIdlePods`): it updates only pods
that are behind, running, not T3-driven, not opted out (`autoUpdate = "off"`), and idle long enough.
Updates are now short (≈40 s, ≈22 s down) and skip the handoff when the agent is idle.

## What Changes

- An account setting: **"Update idle pods automatically at night"** (Settings). Proposed default: OFF.
- Each night at 03:00–05:00 in the owner's timezone, the gateway runs the existing `updateIdlePods` for
  accounts with the setting on. Same eligibility rules; per-pod "off" still wins; never a busy pod.
- The owner gets one morning summary (email): which pods updated, which were skipped and why.
- Box safety: the existing global recreate gate and concurrency cap apply; nightly runs are spread
  across the window, and skipped while a pod-base build runs on the box.

## Decisions

- Default OFF for every account; owners opt in (owner, 2026-10-13). Window 03:00–05:00 owner time.
- Open: morning summary by email or dashboard only — proposed email.

## Impact

DB: one nullable account column (`auto_update_night`, both editions; OSS: off and hidden).
`packages/control-plane` (night runner), gateway timer, Settings UI, one email template. No image build.
