## Why

Problems on pods are found by users, or by chance. On 2026-10-13 alone:
- the podway GTM pod's scheduled jobs did not run for ~19 h (agent always busy) — found by the pod itself;
- a silent Remote Control drop shows "on" (now detected per pod, but nobody is told when restore gives up);
- `podway doctor` runs only when someone clicks "Run doctor".

## What Changes

A fleet health sweep in the gateway, every 15 min, over every running pod. It reads what the pod-agent
already reports (health + doctor, read-only) and alerts ops Telegram (`TELEGRAM_OPS_*`) on:

| Problem | Alert after |
|---|---|
| Remote Control `down` (restore gave up) | at once |
| Agent dead (exited to a shell) | 2 sweeps |
| Scheduled jobs overdue > 2 h | 1 sweep |
| Disk > 90% | 1 sweep |
| Pod-agent unreachable on a `running` pod | 2 sweeps |

One message per new problem, one "resolved" message when it clears. No repeats in between. A daily
digest line if anything is still open. Owner pods and test pods alike; alerts name pods by their
owner-given name.

## Not in scope

- Auto-fixing (doctor `--fix` stays manual or per-pod). Alerts to the pod OWNER by email — a later step.

## Decisions

- Channel: ops Telegram only (owner, 2026-10-13). Thresholds as above.

## Impact

`packages/control-plane` (sweep + dedupe state, in memory like `app-watch.ts`, or a small table),
gateway timer, pod-agent health payload (add `jobsOverdueMs`). Image build for the payload field.
