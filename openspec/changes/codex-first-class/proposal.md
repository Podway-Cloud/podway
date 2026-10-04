## Why

The owner barely uses Codex because it "feels half baked" (2026-10-03). Investigation found three concrete
gaps: (1) the cockpit's Relentless switch does not turn relentless off for Codex — and only half-off for
Claude — and its "Wake to work" switch is read by nothing; (2) a `podway msg` wake goes to the first
ready tmux window, so Codex on a Claude-first pod never gets messages, and the Codex session the owner
drives from the ChatGPT app never sees them; (3) getting from "no Codex" to chatting in the app takes
~11 steps across separate screens.

## What Changes

- **Relentless OFF means off, for both agents**: with the hold switch off, the pod gets no relentless rule
  file, no relentless skill, and no relentless section in the runtime rules (Claude `CLAUDE.md` and Codex
  `AGENTS.md`); stale copies are removed. Flipping the switch refreshes the running pod's config in place.
  "Wake to work" is made honest (owner decision: build the sweep, or hide the switch).
- **Messages reach the right agent**: delivery picks the window of the agent the message is for (Codex on a
  mixed pod), skips plain shells, and — researched separately — reaches the Codex app session.
- **Fewer Codex setup steps**: Enable → sign-in → pairing as one guided flow; a tappable pairing link on
  phones; pairing detected automatically if Codex exposes it; Codex started where the project lives.
  (The per-chat "Full access" reminder shipped in #375.)

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `relentless`: the hold switch governs the rules and skill for every agent, not only Claude's hooks.
- `agent-messaging`: delivery targets the addressed agent's window.
- `multi-agent-pods`: the Codex enable/sign-in/pair flow.

## Impact

- `packages/provider/src/pod-init.ts` (gate the layer), `packages/provider/pod-base/{refresh-common.sh,
  runtime-rules.md,init.sh,podway-refresh}` (strip/remove), `packages/control-plane/src/service.ts`
  (`setAgenticBehavior` → `refreshPodConfig`), `packages/control-plane/src/agent-messaging.ts`,
  `apps/web` Codex cards/wizards. Pod-base image for the in-pod parts; gateway + web for the rest.
