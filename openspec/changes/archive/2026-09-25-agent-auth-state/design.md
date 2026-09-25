## Context

The full map (with file:line evidence) was taken from `origin/main` on 2026-09-24. Key facts:

- `authed` is file-only: `~/.claude/.credentials.json` / `~/.codex/auth.json`, valid until hard expiry
  (`signals.ts:20-31`). Nothing understands a setup-token or API key.
- `agentAuth` is read once at pod-agent start (`main.ts:64`) and baked into commands, greeter,
  `rcCapable` and the relogin/restart guards.
- `setupTokenAuthed` (service.ts:253) is the only place a setup-token Claude reads as authed, and only
  when `t3Control` is true.
- `/agent/relogin` refuses Codex; the signin window runs a bare `claude /login`.
- The captured `authUrl` is sticky and cleared only when a credentials file appears.
- Renew (`completeSetupToken`) closes the wizard on action return, moves `.credentials.json` aside, and
  starts a T3 enable when T3 is off (actions.ts:530).

## Goals / Non-Goals

**Goals:** one source of truth for login state; a fresh, usable sign-in path for every agent × mode
from any state; success only when a usable login actually landed; a test that runs the real flows.

**Non-Goals:** changing how OAuth itself works; changing T3's setup-token flow while T3 drives the pod;
remote-control pairing (Codex `remote-control pair` stays as is — it is only offered once signed in).

## Decisions

### D1. One classifier, no library
`classifyAgentAuth(input) → AgentAuthState` in `@podway/shared`, a pure function. The pod-agent calls it
and reports `authState` on `/healthz` (raw signals stay for older consumers). Web renders only from
`authState`; `setupTokenAuthed` and `agentCardState`'s auth ordering are deleted. The same pattern as
`rc-state.ts`. A state-machine library was rejected: the bug is three disagreeing mappings across a
network boundary, which a client-side library cannot fix.

### D2. The states

| State | Meaning | UI | Action |
|---|---|---|---|
| `signed-in` | A usable login for this mode is present and unexpired | normal card | — |
| `login-pending` | A login is running *now* with a fresh value (`url` or `code`, `issuedAt`, `expiresAt`) | the sign-in wizard: code/link + countdown | **Get a new code** (re-issue) |
| `needs-login` | No usable login and none running (`reason`: `never` · `expired` · `rejected` · `login-exited`) | "Sign in" / "Sign-in expired" | **Sign in** → starts a login → `login-pending` |
| `wrong-mode` | Claude on setup-token or api-key while Podway (not T3) drives the pod | "Sign in with your subscription" | revert to subscription → `login-pending` |
| `unknown` | Pod not reporting / not running | neutral | — |

"Usable" per mode: subscription = credentials file present and unexpired; setup-token = token present
**and** T3 drives the pod; api-key = key present **and** T3 drives the pod.

### D3. Transitions (each is one e2e case)
- boot, no creds → `login-pending` (fresh value) → owner completes → `signed-in`
- `login-pending` value expires or the login process exits → `needs-login(login-exited)` — **never** keeps
  showing the dead value
- `needs-login` → Sign in → `/agent/relogin` → `login-pending` with a **new** value
- `login-pending` → Get a new code → `/agent/relogin` → `login-pending` with a different value
- `signed-in` → token hard-expires or pane shows logout → `needs-login(expired|rejected)`
- setup-token + T3 off → `wrong-mode` → revert → `login-pending`

### D4. Fresh values
Captured values are stored as `{value, window, issuedAt}`. The pod-agent re-scrapes every tick, takes
the **last** match, reads only the window that owns the login (the agent's own window at boot, the
signin window during a relogin — keyed per agent), and drops the value when the pane shows the login
exited (`PODWAY-AGENT-EXITED`, "timed out") or the value is older than its expiry (Codex device code 15
min). `/agent/restart` and `/agent/relogin` clear the value before starting a new login.

### D5. Relogin for both agents
`/agent/relogin` spawns, in the per-agent signin window, the same command boot uses minus the agent
window: Claude `env -u ANTHROPIC_API_KEY … claude /login`; Codex `env -u OPENAI_API_KEY -u
OPENAI_BASE_URL codex login --device-auth`. The signin window closes when the login lands or its
window expires. `maybeRespawnAuthed` does not kill the agent while a relogin is in flight for it.

### D6. Auth mode is read fresh
`agentAuth` becomes a getter over the pod-spec (like `freshDisplayName`), used by command building,
`rcCapable`, and the relogin/restart guards.

### D7. Verified success
`reconnectAgent`, `completeSetupToken`, `revertToSubscription` return only after polling the pod's
`authState` for the expected state (bounded; a timeout returns an error the UI shows). Wizards close
only on `signed-in`. The Renew wizard is offered only when T3 drives the pod and no longer starts a T3
enable.

### D8. The e2e gate — what a machine can and cannot do
`scripts/incus/auth-e2e.sh` runs on a scratch pod (same recipe as `app-smoke.sh`), for each agent:
1. Boot with no creds → assert `login-pending`, value present, `issuedAt` within the last minute, login
   process alive.
2. Call relogin → assert a **different** value.
3. Kill the login process → assert `needs-login(login-exited)` and no value is served.
4. Write a valid credentials file (what a completed login produces) → assert `signed-in`, card state
   ready, signin window gone.
5. Write an expired credentials file → assert `needs-login(expired)`.
6. Claude: set setup-token with T3 off → assert `wrong-mode`; revert → `login-pending`.

A machine cannot finish a real OAuth approval. So the final acceptance is **one manual sign-in per
agent by the owner** on a real pod (GTM for Codex, t3tt for Claude), recorded in tasks.md.
Classifier behavior is also covered by an exhaustive table test in `packages/shared`.

## Risks / Trade-offs
- Pod-agent changes need a pod-base build and each pod updated → older pods keep old behavior until
  updated. Web stays back-compatible: when `authState` is absent it falls back to today's mapping.
- Deleting `setupTokenAuthed` changes what T3 pods report → covered by the T3 case in the classifier
  table (setup-token + T3 = `signed-in`).
- Owner-visible behavior change: the Renew button disappears on non-T3 pods (replaced by "Sign in with
  your subscription"). Intended.
