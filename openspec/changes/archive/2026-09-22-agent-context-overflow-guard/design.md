## Context

The pod agent runs Claude Code in a tmux window under a supervising launcher (`podway-agent-restart`
relaunches `claude --continue`). The pod-agent already parses the pane via `@podway/shared/pane`
(`paneAcceptsInput`, `atBlockingGate`, `agentGone`) and runs a health-check/watchdog loop. Claude
Code's auto-compact summarizes the conversation before the context limit — but only TEXT; a base64
image tool_result cannot be summarized, so a screenshot-heavy session overflows regardless. The
cockpit exposes `autoCompactEnabled` (control-plane `claude-settings.ts`) as a flippable toggle.

Observed failure (makore.app dev, 2026-09-10): ~37 images (~330k tokens each) + auto-compact OFF →
"Prompt is too long" on every turn, unrecoverable without hand-editing the transcript.

## Goals / Non-Goals

**Goals:**
- No pod can run with auto-compact disabled.
- A context-overflowed session self-recovers before the owner sees a dead prompt.
- Recovery preserves the conversation where possible (compact, not wipe).

**Non-Goals:**
- Preventing screenshots (they are legitimate); only bounding their damage.
- Changing Claude Code's compaction itself.
- A general "the agent is confused" recovery — this targets the specific context-limit signature.

## Decisions

**1. Remove the off switch; force on.** Delete the Auto-compact toggle from the settings dialog. In
`claude-settings.ts`, remove `autoCompactEnabled` from the user-settable allow-list and always write
`true` into the pod's Claude settings. Pure hardening — the setting's own comment says it "keeps a
24/7 session from dying at the context limit," so it was never a real user choice.

**2. Detect the stuck state from the pane.** Add `atContextLimit(pane)` to `@podway/shared/pane`,
matching the Claude Code strings ("Context limit reached", "Prompt is too long", "Context low (0%
remaining)"). Detection lives beside the existing pane predicates and is unit-tested against captured
pane text so a Claude Code copy change is caught, not silently missed.

**3. Recovery ladder, bounded.** When `atContextLimit` holds across two checks (debounced, like the
menu-watchdog):
   a. **Strip giant images**: rewrite the active transcript, replacing every base64 image tool_result
      with a short text placeholder (the un-compactable payload) — backing up to `<file>.bak` first.
   b. **Compact**: send `/compact` to the pane (now compaction CAN run, images gone). If the pane
      still shows the limit after a timeout, fall back to a clean agent restart (`--continue` reloads
      the trimmed transcript; the launcher's existing fresh-session fallback is the final safety net).
   Each recovery is logged (`agent_context_recovered`, image count) and rate-limited so it can never
   loop; a pod that re-hits the limit within a short window escalates to an owner-visible health note.

**4. Reuse, don't reinvent.** The trim mirrors the manual fix (walk JSONL, replace image nodes); the
restart reuses `podway-agent-restart`; the health note reuses the existing `ownerDetail`/health-check
surface. No new supervision path.

## Risks / Trade-offs

- **Editing a live transcript.** Done only when the session is already stuck (not taking turns, so not
  appending), and always after a `.bak`. Malformed lines are passed through verbatim, never dropped.
- **False positive.** A benign pane containing "context limit" text could trip it; the debounce +
  requiring the agent to be otherwise non-advancing keeps it from firing on healthy sessions.
- **Recovery vs. a real dead end.** If even the trimmed+compacted session won't fit, the fresh-session
  fallback loses the conversation — acceptable last resort, and strictly better than a permanently
  dead prompt. The owner gets a health note either way.
- **Edition parity.** All three pieces are pure hardening; cloud and OSS both benefit, no divergent
  behavior to spec.
