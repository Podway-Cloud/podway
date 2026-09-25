## Context

`podway msg send` appends JSON to a pod-local outbox that the control plane collects on its poll and
routes via `AgentMessages` (system sender `podway`); crash alerts already wake a triage pod the same way
(`PODWAY_CRASH_ALERT_POD`). Pod-agent already detects the failures we want reported (`codex_rc_start_failed`,
`watchdog_session_restart`, startup backoff, reconnect landing).

## Goals / Non-Goals

**Goals:** one command; evidence attached and scrubbed; dedupe; zero new network paths; owner-visible.

**Non-Goals:** reports about the owner's own app/code; Telegram or GitHub issues (owner decision);
crash-reporting of the dashboard itself (crash-alert exists).

## Decisions

- **Outbox reuse** (a second outbox file, `~/.podway/reports-outbox.jsonl`) — same pull model and auth as
  msg; a pod needs no egress to report.
- **Scrub on the pod, before write**: the secret values are only fully known on the pod
  (`/etc/podway/secrets.env` + agent env); plus regexes for token shapes (sk-ant-, ghp_, gho_, xox*,
  AKIA, JWTs, `--token <v>` args). Bundle capped (~64KB) — logs trimmed first.
- **Fingerprint** = area + the error text with numbers, hex ids, paths and timestamps normalized.
- **Status lifecycle** open → fixed (a fix merged) / ignored; a "fixed" fingerprint that recurs reopens
  and re-wakes triage — the regression signal.
- **Runtime rules** are the only way agents learn when to file; keep it to three lines so it is followed.

## Risks / Trade-offs

- Scrubbing misses a secret → reports stay internal (triage pod + owner only), bundle capped, token regexes
  broad; a test seeds fake secrets and asserts none survive.
- Report storms → per-pod rate limit + fingerprint grouping + triage wakes only on NEW fingerprints.
- Agents over-filing app bugs as platform bugs → the rules draw the line; triage marks "ignored".
