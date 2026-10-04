## Context

See proposal.md. Findings with file:line evidence are in the 2026-10-03 investigation (relentless: refresh-common.sh pb_refresh_codex_agents/pb_translate_codex_skills, pod-init.ts layer copy, hooks gated by relentless.hold; messaging: agent-messaging.ts deliverMessages picks the first ready window; Codex RC daemon is a detached app-server with no tmux).

## Decisions

- Gate at the source (pod-init layer) AND remove stale copies in place, because the in-pod copy steps only add (cp -r).
- Strip the runtime-rules section by markers rather than splitting the file, so one file stays the source of truth.
- Toggle → refreshPodConfig (existing live path: push layer + podway-refresh, no agent restart).

## Risks / Trade-offs

- [A user edited CLAUDE.md] → the existing hash guard writes podway-runtime.md beside it instead; same behavior as today.
- [Running agents keep rules already in context] → they drop them at the next compaction/session; stated in the dialog.
