## ADDED Requirements

### Requirement: Login state is one classified signal
Each agent's login state SHALL be computed by a single shared classifier (`classifyAgentAuth` in
`@podway/shared`) and reported by the pod-agent as `authState` on `/healthz`. The dashboard SHALL render
login UI only from `authState`. No other component SHALL re-derive login state from raw signals.

#### Scenario: One state per agent
- **WHEN** the pod-agent reports an agent
- **THEN** its `authState` is exactly one of `signed-in`, `login-pending`, `needs-login`, `wrong-mode`,
  `unknown`

#### Scenario: A usable login depends on the mode
- **WHEN** Claude runs on a subscription login with an unexpired credentials file
- **THEN** it is `signed-in`
- **WHEN** Claude runs on a setup-token or API key and T3 drives the pod
- **THEN** it is `signed-in`
- **WHEN** Claude runs on a setup-token or API key and Podway (not T3) drives the pod
- **THEN** it is `wrong-mode`

### Requirement: A pending login always shows a fresh, live value
While an agent is `login-pending`, the reported sign-in value (URL or device code) SHALL come from the
login that is running now, with `issuedAt` and `expiresAt`. A value from a login that exited or expired
SHALL never be reported.

#### Scenario: The login times out
- **WHEN** a Codex `--device-auth` login times out or its process exits
- **THEN** the agent becomes `needs-login` with reason `login-exited` and no code is reported

#### Scenario: Several codes were printed
- **WHEN** the login window shows more than one code
- **THEN** the most recent one is reported

### Requirement: Every agent can start a fresh login on demand
`/agent/relogin` SHALL support both Claude and Codex, running the login in a dedicated per-agent signin
window with the same app-key-stripped command boot uses, and SHALL clear any previously captured value
before starting.

#### Scenario: Sign in from needs-login
- **WHEN** the owner presses Sign in on a `needs-login` Codex
- **THEN** a fresh `codex login --device-auth` starts and the agent becomes `login-pending` with a new code

#### Scenario: Get a new code
- **WHEN** the owner presses Get a new code on a `login-pending` agent
- **THEN** the old login is replaced and a different value is reported

#### Scenario: A relogin never kills the working agent
- **WHEN** a relogin is in flight for an agent
- **THEN** the agent's own window is not respawned

### Requirement: The auth mode is read fresh
The pod-agent SHALL read the pod's auth mode from the pod-spec each time it is needed, not once at start.

#### Scenario: Reverting to subscription takes effect without a pod-agent restart
- **WHEN** the owner reverts a setup-token pod to subscription
- **THEN** the next agent start runs the subscription login

### Requirement: Setup-token is only offered when T3 drives the pod
The Renew (setup-token) flow SHALL be offered only when T3 drives the pod and SHALL NOT enable T3. A
`wrong-mode` agent SHALL offer only "Sign in with your subscription".

#### Scenario: T3 switched off
- **WHEN** T3 is turned off on a setup-token pod
- **THEN** Claude shows "Sign in with your subscription", not Renew

### Requirement: Sign-in success is verified
Sign-in, reconnect, renew and revert actions SHALL report success only after the pod reports the target
`authState`. A wizard SHALL close only when the agent is `signed-in`.

#### Scenario: A code that does not land
- **WHEN** the owner submits a code and no usable login appears within the timeout
- **THEN** the wizard stays open and shows the failure

### Requirement: Auth changes pass the real-pod e2e gate
Changes to agent sign-in SHALL pass `scripts/incus/auth-e2e.sh`, which runs every transition for both
agents on a scratch pod, plus the exhaustive classifier table test.

#### Scenario: The gate covers every transition
- **WHEN** the gate runs
- **THEN** it asserts boot → `login-pending`, relogin → new value, login exit → `needs-login`, valid
  credentials → `signed-in`, expired credentials → `needs-login(expired)`, and setup-token without T3 →
  `wrong-mode`, for each agent where it applies
