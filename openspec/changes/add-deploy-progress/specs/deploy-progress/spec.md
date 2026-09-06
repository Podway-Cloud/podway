## ADDED Requirements

### Requirement: First-boot deploy progress is surfaced from env-declared markers

While an environment's first-boot `setup` runs, the platform SHALL surface the environment's OWN
progress messages to the onboarding UI through a generic marker convention, without any app-specific
parsing in the platform.

- An environment communicates progress by emitting a marker: a line `podway-progress: <message>` on
  stdout (captured to `~/.podway-setup.log`) and/or the current message written to `~/.podway-progress`.
- The pod-agent SHALL surface the CURRENT (most recent) marker as a single `setupProgress` field on its
  `/healthz` response, preferring `~/.podway-progress` when present and otherwise the last
  `podway-progress:` line in the setup log.
- The surfaced value SHALL be sanitized at the health trust boundary (control characters stripped,
  length-capped like other `/healthz` strings) so no raw log content or secret can be dumped through it.
- `setupProgress` SHALL be present only while setup is in progress (setup started, not yet done); once
  setup completes it SHALL be null and the onboarding proceeds as before.
- The platform SHALL contain no per-environment or per-app parsing: it relays whatever message the
  environment declared, verbatim (after sanitization).

#### Scenario: An env's milestones appear during onboarding

- **WHEN** an app-pod's setup emits `podway-progress: Pulling n8n…` while the deploy runs
- **THEN** the pod-agent's `/healthz` SHALL report `setupProgress: "Pulling n8n…"` and the onboarding's
  "Starting your agent" step SHALL show that milestone instead of only the generic spinner text

#### Scenario: An env that emits nothing is unaffected

- **WHEN** an environment's setup emits no `podway-progress:` marker (e.g. a fast coding workspace)
- **THEN** `setupProgress` SHALL be null and the onboarding SHALL show its existing default copy, with
  no error and no empty progress element

#### Scenario: A marker is sanitized and bounded

- **WHEN** a marker message contains control characters or exceeds the health-string cap
- **THEN** the surfaced `setupProgress` SHALL have control characters stripped and be truncated to the
  cap, never passing raw multi-line log content to the UI
