# Tasks — agent context-overflow guard

## 1. Auto-compact always on (remove the off switch)
- [x] 1.1 `claude-settings-dialog.tsx`: remove the "Auto-compact" toggle (the `cs-compact` control),
  its `autoCompact` state, and its read/write in the settings payload.
- [x] 1.2 `control-plane/src/claude-settings.ts`: drop `autoCompactEnabled` from the user-settable
  allow-list, and always apply `enabled` when writing the pod's Claude settings (coerce any stored
  value to on).
- [ ] 1.3 Confirm the applied pod setting turns Claude Code auto-compact ON (verify on a scratch pod:
  the pane no longer says "auto-compact is off").
- [x] 1.4 Update any test that asserted the toggle / a disabled value.

## 2. Detect the context-limit state (shared pane predicate)
- [x] 2.1 `@podway/shared/pane`: add `atContextLimit(pane)` matching the Claude Code strings
  ("Context limit reached", "Prompt is too long", "Context low (0% remaining)").
- [x] 2.2 Unit-test it against captured pane text (positive + a benign near-miss).

## 3. Transcript trim (the surgical fix, as code)
- [x] 3.1 A helper that rewrites the active session transcript: replace every base64 image
  tool-result node with a short text placeholder; back up to `<file>.bak` first; pass malformed lines
  through verbatim (never drop). Returns the count stripped.
- [x] 3.2 Unit-test it on a fixture transcript with image nodes → images replaced, JSON still valid,
  line count unchanged.

## 4. Recovery, wired into the watchdog (bounded + logged)
- [x] 4.1 In the pod-agent health-check/watchdog loop: when `atContextLimit` holds across consecutive
  checks, run recovery — trim images (3.1) → restart so the agent re-reads the trimmed transcript →
  `/compact` if still stuck. (`contextWatchdog()` in server.ts, debounced 3 ticks; ladder order put
  restart BEFORE compact because a running Claude holds context in memory — the hand-recovery lesson.)
- [x] 4.2 Rate-limit recovery (a per-agent cooldown in `recoverContextOverflow`, + a `contextRecovering`
  in-flight guard) so it can NEVER loop; log `agent_context_recover*` with the image count and outcome.
- [x] 4.3 If recovery cannot fit the session (reset-fresh), record an owner-visible health note
  (`agent-context-reset` info issue in health-checks.ts) that the prior conversation was reset.

## 5. Verify
- [ ] 5.1 Reproduce the overflow on a scratch pod (flood with a few large images + fill context),
  confirm the watchdog detects + recovers automatically (pane returns to a working prompt).
- [x] 5.2 pod-agent tests green (pane predicate 13/13 + trim/ladder 10/10 + health-checks 18/18);
  pod-agent tsc clean; web typecheck clean; control-plane tests green. (5.1 scratch-pod repro + 5.3
  live toggle-gone/auto-compact-on stay owner-side real-infra checks — in 0asks.md.)
- [ ] 5.3 Confirm the settings dialog no longer shows the toggle and a scratch pod comes up with
  auto-compact ON.

## Recorded, NOT built here
- [ ] R.1 Downscaling screenshots at capture time (smaller images = less pressure) — a webapp-testing
  / skill-side change, separate from this recovery guard.
- [ ] R.2 A fleet sweep to detect any OTHER pods currently near/at the context limit and pre-empt them
  — useful, but its own change.
