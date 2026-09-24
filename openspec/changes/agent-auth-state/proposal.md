## Why

Agent sign-in / "Sign-in expired" has been patched ~20 times and keeps breaking, because the state is
computed three separate times and they disagree:

1. **pod-agent** derives raw signals (`authed` from the credentials file only, `needsReauth` from pane
   text, `rcState`, a sticky captured `authUrl`), with the pod's auth mode **frozen at process start**.
2. **control-plane** masks them (`setupTokenAuthed` flips a setup-token Claude to authed — only when T3
   drives the pod).
3. **web** re-maps them in `agentCardState`, whose check order sends a never-signed-in Claude to
   "Sign-in expired" and whose Codex branch has no action at all.

Every flow reports success without confirming a usable login landed. Nothing drives a real login to
completion in a test, so each fix silently breaks a sibling path. Two live failures on 2026-09-24:

- **Codex (GTM pod):** signed out on a healthy pod. The boot `codex login --device-auth` timed out after
  15 min and exited; `/healthz` kept serving the dead device code; `/agent/relogin` rejects Codex
  (`unsupported-agent`), so there is no way to get a fresh code. OpenAI rejects the stale one.
- **Claude (t3tt, T3 switched off):** the "Renew" wizard mints a setup-token — "inference-only, useless
  under Podway control" per the code — lands no credentials file, closes as if it worked, and quietly
  re-enables T3. The card stays "Sign-in expired" forever.

## What Changes

- **One auth classifier** in `@podway/shared` (`classifyAgentAuth`): raw signals → exactly one
  `AgentAuthState` (`signed-in` · `needs-login` · `login-pending` · `wrong-mode` · `unknown`). The
  pod-agent reports it on `/healthz`; web renders only from it. `setupTokenAuthed` and the ad-hoc
  ordering in `agentCardState` are replaced by it. No state-machine library — the problem is three
  sources of truth, not a missing engine.
- **On-demand fresh login for both agents.** `/agent/relogin` supports Codex (`codex login --device-auth`
  in the dedicated signin window) and uses the same app-key-stripped command as boot. Every login
  reports a *fresh* value with `issuedAt`/`expiresAt`; a dead or expired login is never shown.
- **"Get a new code".** `login-pending` shows the code/link, a live countdown, and a re-issue action.
  Codex uses the shared sign-in wizard (no card-inline duplicate; supersedes #344's inline block).
- **Auth mode read fresh**, not frozen at pod-agent start.
- **Setup-token only under T3.** With T3 off, a setup-token Claude is `wrong-mode`, whose only action is
  "Sign in with your subscription". The Renew wizard is offered only when T3 drives the pod, and no
  longer turns T3 back on.
- **Success is verified.** Wizards and actions close only when the classifier reports `signed-in`.
- **A real-pod e2e gate** (`scripts/incus/auth-e2e.sh`) exercises every agent × flow on a scratch pod
  and must pass before any auth change ships.

## Capabilities

### Modified Capabilities
- `agent-credentials`: login state becomes one classified signal with an explicit transition per flow;
  Codex gains on-demand relogin; setup-token is constrained to T3-driven pods; success is verified.

## Impact

- `packages/shared` (classifier + tests), `packages/pod-agent` (signals, relogin, capture, fresh auth
  mode), `packages/control-plane` (drop `setupTokenAuthed`, verified actions), `apps/web` (card +
  wizards render from the classifier).
- pod-agent changes ship in a pod-base image; each pod must update to get them. Web/control-plane
  changes ship by deploy.
- `agent-credentials` spec is restructured around the state model (the per-incident scenarios are
  folded into per-transition scenarios).
