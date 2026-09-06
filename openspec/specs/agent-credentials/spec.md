# agent-credentials Specification

## Purpose

Podway agents authenticate **per pod**. Each pod runs the agent CLI's own login
(`claude /login`, `codex login`) once, and that grant lives on the pod's own
persistent volume. There is no shared credential vault and no cross-pod
propagation: a new pod means a new login. This spec defines that per-pod login
model, the requirement that the app's injected `ANTHROPIC_API_KEY` never hijacks
the agent's subscription login, and the boundaries that keep login material off
logs, out of the environment format, and inside the owning pod.
## Requirements
### Requirement: Each pod authenticates its own agent login

A pod has an authentication mode (`agentAuth`), defaulting to `subscription`. In
`subscription` mode the pod SHALL obtain the agent CLI's credentials by running that
CLI's login flow inside the pod: on first boot with no credentials file present it
SHALL start the login flow; once a credentials file exists it SHALL launch the agent
already authenticated with no login step. In `api-key` mode the pod SHALL run the
agent on a caller-supplied API key instead, with NO login flow (see "A pod may run its
agent on a BYO API key" below).

#### Scenario: First boot runs the CLI login (subscription)

- **WHEN** a subscription-mode pod boots and no credentials file exists for its agent
  (`~/.claude/.credentials.json` for claude, `~/.codex/auth.json` for codex)
- **THEN** the pod's first tmux session runs the CLI login (`claude /login` /
  `codex login`) so the user can sign in

#### Scenario: The login menu-walk stops at the sign-in URL

- **WHEN** the automated `/login` menu-walk finds the pane showing the sign-in URL or the
  paste-code prompt
- **THEN** it SHALL send NO further keystrokes and SHALL report success, because that state is
  terminal for the machine: the menu has been walked and the flow is waiting on a HUMAN
- **AND** it SHALL read the pane BEFORE typing rather than typing and inspecting afterwards, so a
  slow render can never place a keystroke on the paste-code prompt

#### Scenario: A stray keystroke must never cost a valid login

- **WHEN** an empty or invalid code reaches the paste-code prompt
- **THEN** the CLI rejects it, retries with a NEW code challenge, and the sign-in link the owner has
  already opened stops matching the one the CLI awaits, so the exchange fails — and the agent
  DELETES its credentials file, destroying a login that was still valid and ending the live session
- **AND** the reconnect flow SHALL therefore treat typing into that prompt as destructive, never as
  a harmless retry (observed end-to-end on a test pod, 2026-09-06: a valid login with 27 days

#### Scenario: A reconnect never costs a login it failed to replace

- **WHEN** a reconnect drives the login flow on a pod that already holds a credentials file
- **THEN** that file SHALL be snapshotted BEFORE anything is typed, and SHALL be restored if the
  flow leaves no credentials file at all — a failed OAuth exchange deletes it outright, which turned
  a valid login with 27 days remaining into a signed-out pod and a lost session (test pod,
  2026-09-06)
- **AND** the restore SHALL apply ONLY when no credentials file is present, since a successful login
  always writes one, so the guard can never overwrite a freshly minted credential
- **AND** the check SHALL be repeated over a grace window rather than acting on first sight, so a
  normal delete-then-write during a successful login is not mistaken for destruction

#### Scenario: Reconnecting a still-VALID login surfaces its sign-in link

- **WHEN** an owner asks to reconnect an agent whose credentials file still exists — the normal case
  for renewing a login that is valid but EXPIRING, which is what the Reconnect button is for
- **THEN** the sign-in link SHALL be published to the cockpit anyway, and SHALL NOT be discarded on
  the grounds that the pod is "already signed in"
- **AND** the link SHALL stop being offered as soon as a new credential is written, so a dead
  sign-in URL is never left on screen after a successful reconnect
- **AND** the offer SHALL expire on its own, so an abandoned attempt goes quiet without intervention

The gates previously keyed on the credentials file being ABSENT. The link was therefore deleted on
every health tick while a valid credential existed, and the cockpit waited forever (test pod,
2026-09-06, both attempts). It only ever proceeded when a failed exchange DELETED the credentials —
the destruction was what unblocked the flow, which is the clearest sign the condition was wrong.

#### Scenario: A wrapped sign-in URL is recovered whole

- **WHEN** the agent CLI prints its sign-in URL across several pane rows, the last of which is padded
  with trailing spaces because the capture preserves them
- **THEN** the URL SHALL be rejoined including its final row, since the trailing `state` parameter
  lives there and OAuth rejects the URL without it
- **AND** the rejoin SHALL still stop at a row that is not part of the URL, such as a shell prompt,
  so no surrounding text is swallowed into the link

#### Scenario: A reconnect's sign-in prompt survives an autonomous agent

- **WHEN** an owner starts a reconnect on a pod whose agent is actively working
- **THEN** the login SHALL be driven in a DEDICATED window, never the agent's own pane, so the
  agent's output cannot erase the prompt the owner is about to paste their code into
- **AND** the agent SHALL keep working throughout, rather than being frozen behind a prompt
- **AND** the sign-in link SHALL be read from that window, since that is where it is printed

Driving the login in the agent's pane is a race the agent wins: it is autonomous, so its next turn
prints over the prompt. Observed on a test pod (2026-09-06): the owner fetched their OAuth code,
returned to paste it, and the pane had moved on to writing a file and running a command — there was
nothing left to paste into, and the cockpit fell back to its normal view because no login was in
progress any more. Relentless working makes this strictly worse, so the fix separates the two rather
than trying to win the race.

#### Scenario: A reconnect beside a DEAD agent still reports failure

- **WHEN** a reconnect is requested on a pod whose agent pane is a bare shell rather than a live
  agent
- **THEN** it SHALL report failure so the caller respawns the agent, even though the login itself
  could have been completed in the dedicated window
- **AND** the check SHALL be a POSITIVE test for a live agent UI, because a bare shell carries no
  exit marker and shows no gate, so every negative predicate passes it

#### Scenario: The sign-in code reaches the window that asked for it

- **WHEN** an owner submits their sign-in code from the cockpit
- **THEN** it SHALL be delivered to the window currently showing the sign-in prompt, not to the
  agent's own window
- **AND** a pod with no separate sign-in window — a first-boot login — SHALL still receive it in the
  agent's window, since that is where its prompt is

Moving where a prompt LIVES means moving the input that answers it. When the login moved to its own
window and this did not follow, the pasted code went to a pane that was not asking while the prompt
waited in the other one, and the cockpit sat on "Signing in…" indefinitely (test pod, 2026-09-06).

#### Scenario: A finished sign-in leaves nothing behind

- **WHEN** a reconnect's login completes and a new credential is written
- **THEN** the dedicated sign-in window SHALL be retired, so the owner is not left with a stray tab
  in their pod terminal
- **AND** closing it SHALL be best-effort: the reconnect has already succeeded by then, so a window
  that will not close must never turn a success into a failure

The agent CLI ends a successful login on "Login successful. Press Enter to continue…" and waits for a
keypress nobody sends, so the window otherwise sits there indefinitely (observed after a fully-expired
reconnect on a test pod, 2026-09-06).

#### Scenario: The whole reconnect path is exercised in one run

- **WHEN** the reconnect behaviour is tested
- **THEN** a single test SHALL drive the PATH end to end — request, link published, code delivered,
  credential replaced, window retired — not each piece in isolation

Seven separate bugs shipped in this flow because every piece had passing tests and nothing exercised
the path. Each was only visible once the previous was fixed, so they surfaced one per owner attempt
across an afternoon. Three of them were not logic errors at all: two halves of the system disagreed
about where something lived — which handler set a flag, which window showed a prompt, which file held
a credential — and no unit test can see a disagreement between two things it tests separately.

#### Scenario: Already-authenticated pod skips login

- **WHEN** a subscription-mode pod boots and a credentials file already exists on its
  volume
- **THEN** the pod launches the agent directly, with no login step

### Requirement: A pod may run its agent on a BYO API key

When a pod's `agentAuth` is `api-key`, the pod SHALL launch the agent authenticated with
a bring-your-own API key rather than the subscription login: the key is set for the agent
PROCESS ONLY (from a reserved secret, so the general environment never carries it and app
code / other agents are unaffected), the `/login` flow SHALL be skipped entirely, and the
in-pod greeter SHALL accept the CLI's "use this API key?" prompt (which otherwise defaults
to "No" and blocks the session). This is the ToS-clean path for unattended / automated
pods (docs/plans/api-key-pod-mode.md). `agentAuth` defaults to `subscription`.

#### Scenario: api-key pod launches on the key, never logs in

- **WHEN** an `api-key`-mode pod boots
- **THEN** the agent SHALL launch with the BYO key set for its process, no `/login` step
  SHALL run, and the greeter SHALL accept the "use this API key?" prompt so the session
  proceeds

#### Scenario: Subscription pods are unaffected

- **WHEN** a pod's `agentAuth` is `subscription` (the default)
- **THEN** the agent SHALL authenticate via the login flow with the app's API key stripped,
  exactly as before

### Requirement: A pod may run Claude on a 1-year setup-token

When a pod's `agentAuth` is `setup-token`, the pod SHALL launch Claude authenticated with a
~1-year `claude setup-token` (carried as `CLAUDE_CODE_OAUTH_TOKEN`, set for the agent PROCESS
ONLY from a reserved secret): the `/login` flow SHALL be skipped entirely and the agent SHALL
NOT gate on a credentials file (setup-token mode never writes one). The pod-agent SHALL
recognize `setup-token` on EVERY path that reads `agentAuth` — first boot, in-place respawn
(restart/reconnect), and the boot-time login assistant — so a setup-token pod never falls
through to the subscription `claude /login` path. A mode value the pod-agent does not
recognize SHALL default to `subscription`.

#### Scenario: setup-token pod launches on the token, never logs in

- **WHEN** a `setup-token`-mode pod boots (or its agent window is respawned by a restart or
  reconnect)
- **THEN** Claude SHALL launch with `CLAUDE_CODE_OAUTH_TOKEN` set for its process, no `/login`
  step SHALL run, and the pod SHALL NOT drive a "Select login method" menu at the session

#### Scenario: An unrecognized auth mode is never stranded at /login

- **WHEN** the pod-agent reads an `agentAuth` value it does not recognize
- **THEN** it SHALL treat the pod as `subscription` (a working default), never leaving a pod
  that carries a valid token sitting at a sign-in screen

### Requirement: Renewing an expired login resumes the prior conversation

When a pod's agent login expires while the pod is RUNNING and the owner re-authenticates, the agent
window SHALL be respawned with the boot command, which resumes the prior transcript (`--continue`).
The owner SHALL land back in their conversation, not an empty session.

This SHALL NOT be conditioned on the pod having BOOTED unauthenticated. Until 2026-09-05 it was:
the check read a boot-time flag, so the resume fired only for a cold unauthenticated boot and never
for the far commoner case of a ~30-day login expiring weeks into a pod's life. The owner reported
the symptom as "reconnect = empty session": no history, `/login` still on screen, and an agent that
said nothing until spoken to.

The re-arm matters as much as the trigger: a pod may have its login renewed many times over its
life, so a once-per-process latch SHALL NOT prevent later renewals from resuming.

This resume is the SAFETY NET, not the primary path — see "Reconnecting renews the login inside the
running session" below. It still matters whenever the agent process does die (an update, a crash, a
pod restart), which is why the trigger and the re-arm above remain required behavior.

#### Scenario: A login expires mid-life and is renewed

- **WHEN** a running pod's credential becomes expired or absent, and the owner then re-authenticates
- **THEN** the agent window SHALL respawn resuming the prior transcript, and the owner SHALL see
  their previous conversation rather than a fresh one

#### Scenario: A pod that was authenticated all along

- **WHEN** a pod's credential has been usable continuously
- **THEN** no respawn SHALL occur — there is nothing to resume and a respawn would interrupt the
  live session

### Requirement: Reconnecting renews the login inside the running session

When the owner reconnects a Claude agent on a RUNNING pod, the system SHALL first attempt to renew
the login **without terminating the agent process**, by typing the in-session `/login` command into
the live pane and advancing the "Select login method" menu so the sign-in URL is printed and
captured.

Killing the process to re-authenticate is observable to the owner in a way transcript resume does
not fix. The remote-control session id is STABLE across a respawn, but ending the process causes
claude.ai to mark that session ARCHIVED, and the owner had to un-archive it by hand after every
reconnect (owner report, 2026-09-05). Keeping the process alive means there is no archived session,
and the conversation continues by construction rather than by replaying a transcript.

The pod SHALL report honestly whether it did this, and the caller SHALL fall back to the historical
wipe-the-credential-and-respawn path on anything other than an explicit success. A false success is
the dangerous failure: it would skip the fallback and leave the owner with a login that was never
renewed and no error on screen. Unreachability is therefore NOT success.

The pod SHALL refuse when it cannot safely type into the pane: a codex agent (which authenticates
through its own daemon), a setup-token or api-key pod (which never goes through `/login`), a pane
with no agent window, a pane whose agent has exited, and a pane showing a blocking modal that eats
keystrokes.

Refusal SHALL be decided by OBSERVING the outcome, not only by inspecting the pane beforehand: a
pane that is a bare shell for a reason other than the supervisor's exit marker looks "present" to a
presence check. The pod therefore types, waits for the login menu to actually appear, and reports
failure if it does not.

#### Scenario: A running pod's login is renewed in place

- **WHEN** the owner reconnects Claude on a running pod whose agent is live and accepting input
- **THEN** `/login` SHALL be typed into that pane, the method menu SHALL be advanced, the sign-in
  URL SHALL be captured for the cockpit, and the agent process SHALL NOT be terminated

#### Scenario: The pane cannot be driven

- **WHEN** the agent has exited, a blocking modal is up, the agent is codex, the pod is on a setup
  token or api key, or the login menu never appears after typing
- **THEN** the pod SHALL report failure with a reason, and the reconnect SHALL fall back to wiping
  the credential and respawning the window

#### Scenario: The pod cannot be reached

- **WHEN** the request to the pod fails, times out, or returns a body that is absent, unparsable, or
  does not explicitly say it succeeded
- **THEN** the reconnect SHALL fall back to the respawn path rather than treat it as renewed

### Requirement: Agent logins are never shared across pods

The platform SHALL NOT capture, store, or inject agent credentials between pods.
There is no credential vault, no write-back of refreshed tokens, and no
cross-pod propagation; each pod owns only its own grant.

#### Scenario: A new pod requires its own login

- **WHEN** a user who has already signed a different pod into an agent launches a
  new pod for that same agent
- **THEN** the new pod starts its own login flow — it receives no credentials
  from any prior pod or from the control plane

#### Scenario: A refreshed token stays local to its pod

- **WHEN** the agent CLI in a running pod refreshes or rotates its token
- **THEN** the new token is written only to that pod's own volume; no other pod
  and no central store is updated

### Requirement: A pod's login persists across sleep and wake

A pod SHALL remain authenticated across suspend/resume and cold restarts without
repeating the login, because the credentials file lives on the pod's persistent
home volume.

#### Scenario: Login survives suspend/resume

- **WHEN** an authenticated pod is suspended and later resumed (or cold-restarted)
- **THEN** the agent boots still authenticated, reading the credentials file from
  its volume, with no new login step

### Requirement: The app's API key does not hijack the agent login

The agent CLI SHALL be launched with `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`
stripped from its own environment, so an app key injected by the environment does
not hijack the agent's subscription login. Podway agents authenticate on the
user's subscription via `/login`, not on the app key; the app's own processes
still receive the key.

#### Scenario: Claude is launched with the app key stripped

- **WHEN** the pod launches the claude CLI (for login or for an authenticated
  session)
- **THEN** it runs under `env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN`, so
  Claude Code does not see the app key and does not interrupt with a "use this
  API key?" prompt

#### Scenario: The app still gets its key

- **WHEN** the env's app process (e.g. `pnpm dev`) runs via the agent's shell
- **THEN** it re-sources the injected key from `/etc/podway/secrets.env` and runs
  with `ANTHROPIC_API_KEY` set as normal

#### Scenario: The API-key prompt is declined if it appears

- **WHEN** the "use this API key? / custom API key in your environment" prompt
  nonetheless surfaces during login
- **THEN** the pod-agent greeter accepts the highlighted "No (recommended)"
  default so the subscription login is not overridden

### Requirement: The agent reports its login state as a signal

The pod-agent SHALL report whether the agent's credentials file is present and
non-empty (with a short content hash that never contains the secret) so the
launch wizard and terminal can detect the unauthenticated→authenticated
transition and advance. This signal is for UI progression only; it never carries
or persists credential material off the pod.

#### Scenario: The authed transition advances the login UI

- **WHEN** the credentials file appears (or its content hash changes) in a
  running pod
- **THEN** the pod reports an `authed` status signal, and the wizard/terminal
  moves past the login step

#### Scenario: The signal carries no secret

- **WHEN** the login-state signal is emitted
- **THEN** it contains only `{ agent, authed, hash }` where `hash` is a truncated
  digest, never the credentials themselves

### Requirement: Credentials never leak beyond the pod

Login material SHALL exist only as files on the owning pod's own volume, owned by
the pod's unprivileged `dev` user; it SHALL never appear in logs, in the
environment format, or on any marketplace-visible surface.

#### Scenario: Logs are clean

- **WHEN** login or status reporting runs
- **THEN** no log line contains credential material

#### Scenario: The environment format refuses credentials

- **WHEN** an environment file attempts to carry credential-bearing keys
- **THEN** validation hard-fails; credentials are never declared in or shipped by
  the environment format

### Requirement: The GitHub connection is separate from the agent login

Private-repo access SHALL use a short-lived GitHub user token (from the web app's
OAuth device flow), installed into `gh`/`git` inside the pod. This is distinct
from the agent's Claude/Codex login and follows the same no-leak rules.

#### Scenario: The token is installed without appearing in the process list

- **WHEN** the pod-agent receives the user's GitHub token
- **THEN** it passes the token to `gh auth login --with-token` via stdin (never
  argv), runs `gh`/`git` as the `dev` user with `HOME=/home/dev`, and lands the
  credential on the persistent volume where the dev shell's `git clone` finds it

#### Scenario: A BYO repo cloned at launch reports its connection honestly

- **WHEN** a pod is launched from a user's own GitHub repo with a clone token
- **THEN** first boot SHALL install that token into BOTH `git` (credential store) and
  `gh` (`gh auth login --with-token` via stdin), so the pod's reported GitHub status —
  which is derived from `gh` — reflects the working connection rather than showing
  "not connected" while `git` alone is authenticated

### Requirement: One durable GitHub connection, reused by every pod (cloud)

On cloud, the owner's GitHub connection SHALL be a SINGLE durable account-level connection (one per
user, stored encrypted), managed in dashboard Settings — connect once and every pod, at launch and
when added to an existing pod, reuses it. The connection SHALL NOT self-expire; the owner ends it
explicitly. Connecting or reconnecting SHALL install the token on the owner's reachable pods;
disconnecting SHALL clear it from the owner's reachable pods AND delete the stored connection. The
fan-out SHALL be best-effort per pod — an unreachable (suspended) pod is skipped rather than failing
the whole operation. Disconnect and reconnect SHALL be available ONLY in Settings; the launch and
add-to-pod wizards MAY show connection status but SHALL NOT offer disconnect (it is account-wide).
Self-host is exempt — it connects GitHub in-pod, per pod, with no central account connection.

#### Scenario: Connect once, every pod gets access

- **WHEN** the owner connects GitHub in Settings
- **THEN** the token SHALL be installed on each of the owner's reachable pods, and every future pod
  SHALL reuse the same connection without a per-pod sign-in

#### Scenario: Disconnect revokes access across pods

- **WHEN** the owner disconnects GitHub in Settings (a warned, destructive action)
- **THEN** the stored connection SHALL be deleted AND the token cleared from each reachable owned
  pod, so those pods can no longer clone/pull/push a private repo until the owner reconnects — a repo
  already cloned to a pod's disk remains

#### Scenario: An unreachable pod does not fail the fan-out

- **WHEN** a pod is suspended/unreachable while connecting or disconnecting
- **THEN** the fan-out SHALL skip that pod and still complete for the rest, reporting how many pods
  it reached

#### Scenario: The connection is durable

- **WHEN** time passes without the owner touching the connection
- **THEN** it SHALL remain valid rather than self-expiring, so pods keep working across sessions

### Requirement: A running pod's agent login is kept fresh before it can hard-expire

An agent's OAuth refresh token has a hard expiry (~27–30 days) and only refreshes while the agent is
actively used. The platform SHALL prevent a **running** pod's login from silently passing that expiry
by triggering a token refresh for an agent that has been idle long enough to be at risk. This SHALL
NOT be limited to suspended pods, and SHALL apply to both cloud (Incus) and self-host (`local`) pods,
neither of which idle-sleeps.

#### Scenario: A long-idle running agent is refreshed before expiry

- **WHEN** a running pod's agent has been idle beyond the refresh threshold and its login has not yet
  hard-expired
- **THEN** the platform triggers a trivial non-interactive agent invocation that forces the agent's
  on-demand token refresh, and the refreshed credential is written to the pod's own volume

#### Scenario: An actively-used agent is not disturbed

- **WHEN** a pod's agent is reporting `busy`/`shell` or has been idle less than the refresh threshold
- **THEN** the platform does not trigger a refresh for it (its token is already fresh from use)

#### Scenario: A refresh that cannot succeed does not mask the failure

- **WHEN** a refresh is attempted but the login has already hard-expired (or the pod is unreachable)
- **THEN** the pod continues to report `loginExpired`, the owner-facing "sign-in expired" state and
  Reconnect path remain available, and the refresh outcome is recorded so a persistently-failing pod
  is visible in the fleet view

### Requirement: Keeping the login fresh is the mechanism; a failing keepalive is surfaced as a fault

Keeping the token fresh (the refresh keepalive) is the primary, expected mechanism — a healthy
running pod's login SHALL NOT drift toward hard expiry, and the owner SHALL NOT be routinely asked to
re-authenticate a running pod. The platform SHALL treat an approaching expiry on a running pod ONLY
as a signal that the keepalive is **failing** (a fault to fix), never as a routine reminder the owner
must act on. Terminal expiry remains handled by the existing `loginExpired` detection + Reconnect.

#### Scenario: A healthy running pod never warns about expiry

- **WHEN** a running pod's refresh keepalive is working and its login is being kept fresh
- **THEN** no expiry warning is shown — the owner is never asked to babysit the token

#### Scenario: A failing keepalive is surfaced as a fault

- **WHEN** a running, reachable pod's login is approaching hard expiry DESPITE the keepalive (refresh
  is failing or is not reaching that pod)
- **THEN** the platform raises a fault-level signal that the sign-in could not be kept fresh, so it
  can be fixed before it expires — distinct from a routine "please reconnect" nudge

#### Scenario: Suspended pod is not warned

- **WHEN** a pod is suspended and its login is approaching or past expiry
- **THEN** no proactive expiry warning is raised for it; its expired state is surfaced instead on its
  next wake via the existing `loginExpired` detection

### Requirement: A lapsed login recovers to the correct state on wake and via reconnect

A suspended pod is expected to lapse. On wake, the platform SHALL bring it to the correct, honest
state — reporting `loginExpired` rather than a false-healthy `idle` — and SHALL offer an explicit
owner-driven reconnect that restores the login without recreating the pod.

#### Scenario: A suspended-then-woken pod reports its expired login

- **WHEN** a pod whose login lapsed while suspended is woken
- **THEN** its `/healthz` reports `authed:false` and `loginExpired:true`, the `agent-login-expired`
  health issue is raised, and the dashboard surfaces the "sign-in expired" state — never "idle"

#### Scenario: Owner reconnects a lapsed agent

- **WHEN** the owner triggers Reconnect for an agent whose login expired
- **THEN** the platform clears the dead credential and restarts the agent into its login flow so the
  owner can re-authenticate, without destroying or recreating the pod

### Requirement: Login-expiry detection and refresh are agent-agnostic

The detect / warn behavior SHALL apply equally to every supported agent (Claude Code and Codex),
reading each agent's own credential file and expiry field. A credential that never expires (e.g. a
bare API key) SHALL never be reported as expired. Proactive token REFRESH is Claude-only for now — a
verified-safe headless Codex refresh command is not yet confirmed, so Codex relies on detect + warn +
reconnect rather than an unverified auto-refresh (documented deferral).

#### Scenario: Codex expiry is detected like Claude's

- **WHEN** a pod runs Codex and its `~/.codex/auth.json` OAuth token is past its expiry field
- **THEN** the pod reports `loginExpired` for Codex and is eligible for the same warning and reconnect
  treatment as Claude (auto-refresh remains Claude-only until a safe Codex command is verified)

#### Scenario: A non-expiring credential is never flagged

- **WHEN** an agent is authenticated with a credential that carries no expiry (e.g. an API key)
- **THEN** it is never reported as `loginExpired` and is never selected for refresh

