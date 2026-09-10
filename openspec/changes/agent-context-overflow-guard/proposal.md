## Why

A 24/7 pod agent can flood its own context and get **permanently stuck** — every turn dies with
"Prompt is too long / Context limit reached," and the owner, who is not on the machine, just sees an
error they cannot clear or ask about. This happened live on the makore.app dev pod (2026-09-10): the
agent accumulated ~37 full-size screenshots (~330k tokens each — images cannot be compacted away),
AND auto-compact had been turned off via the cockpit toggle, so the session could not shrink itself.
Recovery took a human with box access hand-editing the transcript. A normal owner has none of that.

Two gaps let this happen, and both are ours to close:
1. The cockpit lets a user turn **auto-compact OFF** — the one setting that keeps a 24/7 session alive.
2. Nothing DETECTS or RECOVERS a context-overflowed session; it just stays dead.

## What Changes

**A. Auto-compact is always on — remove the off switch.**
Remove the "Auto-compact" toggle from the cockpit Claude-settings dialog, and force
`autoCompactEnabled` true wherever it is applied to the pod (drop it from the user-settable set /
coerce to true), so no pod can run with it disabled. The platform already documents this setting as
"keeps a 24/7 session from dying at the context limit" — it should never have been optional.

**B. A pod-agent watchdog that detects and auto-recovers a context-overflowed session.**
The pod-agent already reads the agent's tmux pane (`@podway/shared/pane`, the greeter/health-check
loop). Add a detector for the stuck state ("Context limit reached", "Prompt is too long", "Context
low (0% remaining)") and an auto-recovery: strip the un-compactable giant image blobs from the active
transcript, then trigger a compaction (or an agent restart) — the exact surgical fix a human just did
by hand, applied automatically before the owner ever sees the error. Bounded + logged, like the other
self-heal paths, so it can never loop.

## Capabilities

### New Capabilities
- `agent-context-health`: the agent never runs with auto-compact disabled, and a context-overflowed
  session is auto-detected and recovered rather than left dead.

## Impact

- `apps/web/components/claude-settings-dialog.tsx` — remove the Auto-compact toggle + its field.
- `packages/control-plane/src/claude-settings.ts` — drop `autoCompactEnabled` from the user-settable
  allow-list and always apply `true` to the pod.
- `packages/pod-agent/src/*` — a new context-overflow detector (`@podway/shared/pane`) + a recovery
  step wired into the existing health-check/watchdog loop (strip transcript images → compact/restart).
- No schema change. Behavior spans a shared surface (web + control-plane + pod-agent); cloud + OSS both
  get the always-on default (safe — pure hardening).
