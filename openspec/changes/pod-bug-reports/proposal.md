## Why

When the platform misbehaves on a pod — auth stuck, a startup entry that never launched, the Codex RC
daemon failing, a podway CLI error — the only report path today is a free-text `podway msg` to the
operator's pod. Those reports were excellent when they came (makore.app prod's tunnel outage, test:1's
disk-fill), but they need forensics to diagnose (`ps`, guessing pids), they are not deduped, and a pod
with no agent watching never reports at all. Platform bugs should reach the triage agent automatically,
with the evidence attached.

## What Changes

- `podway bug "<what went wrong>" [--area auth|startup|rc|disk|update|cli|other] [--detail -]` files a
  structured report with an auto-collected, SCRUBBED diagnostic bundle: pod name + image version,
  per-agent `/healthz` (authState, rcState), `podway doctor --json`, `podway startup list`, the last ~200
  pod-agent log lines, disk and memory.
- Transport = the existing pod outbox the control plane already polls (`podway msg` uses it): no new
  network path, same pod authentication.
- Reports are stored and grouped by fingerprint (area + normalized error signature) with a count; a NEW
  fingerprint (or one reopened after "fixed") wakes the triage pod (owner decision: podway dev only — no
  Telegram, no GitHub) with a system message.
- The pod-agent files reports AUTOMATICALLY for unambiguous platform faults it already detects: the Codex
  RC daemon failing to start 10 times in a row, and a startup entry the watchdog gave up on. Rate-limited
  per pod. (Relogin-never-landed and watchdog restarts were dropped in implementation — see the spec.)
- Agents are told when to file: the runtime rules (Claude `CLAUDE.md`, Codex `AGENTS.md`) say "platform
  misbehaves → `podway doctor`; not fixed → `podway bug`; never for the owner's own code".
- Owners see reports from their pods in the cockpit (Insights → Reports: what, when, status).

## Capabilities

### New Capabilities
- `pod-bug-reports`: filing, scrubbing, grouping, routing and showing platform bug reports from pods.

### Modified Capabilities

## Impact

- pod-base: `podway bug` in the CLI; runtime rules text. pod-agent: auto-report hooks + outbox writer.
- control-plane: outbox collection, `pod_reports` table (migration, two-edition, additive), routing to the
  triage pod (`PODWAY_BUG_REPORT_POD`, default the crash-alert pod).
- web: cockpit Insights "Reports"; an admin list with status (open / fixed / ignored).
- Self-host: reports are stored and shown to the owner; no triage pod unless configured.
- Ships with a pod-base image (CLI + pod-agent) AND gateway + web.
