## Purpose

Let a pod report platform bugs — from its agent or automatically from the pod-agent — with enough
scrubbed evidence to diagnose them, grouped so a fleet-wide bug is one report, routed to the triage agent,
and visible to the pod's owner.

## ADDED Requirements

### Requirement: A pod files a platform bug with a scrubbed diagnostic bundle

`podway bug "<summary>"` (the pod-agent's local `POST /bug-report`) SHALL file a report carrying the summary, an area, and a diagnostic bundle (pod
name and image version, per-agent health incl. authState and rcState, doctor findings, startup process
state, recent pod-agent log lines, disk and memory). Before the report leaves the pod, every value of
every secret in the pod's environment and any string matching a known token pattern SHALL be replaced
with `[redacted]`. Filing SHALL use the pod's existing outbox; it SHALL NOT need network access from the
pod.

#### Scenario: An agent files a report
- **WHEN** an agent runs `podway bug "startup entry prod-tunnel not running" --area startup`
- **THEN** a report with the bundle SHALL reach the control plane on its next poll, and the CLI SHALL
  print that it was queued

#### Scenario: A secret appears in a log line
- **WHEN** a collected log line contains the value of a pod secret
- **THEN** the stored report SHALL contain `[redacted]` in its place, never the value

### Requirement: The pod-agent reports known failures on its own

The pod-agent SHALL file a report without any agent for failures it detects that are unambiguous
platform faults: the Codex RC daemon failing to start 10 times in a row, and a startup entry the watchdog
gave up on after its retries. Each automatic report SHALL fire at most once per failure per 6 hours, and
automatic and manual reports together SHALL be rate-limited to 5 per pod per hour. (A relogin that never
lands is NOT auto-reported: it is indistinguishable from an owner who walked away from the wizard. A
watchdog session restart is NOT: the restart is the recovery, and the process exits before a bundle can
be collected.)

#### Scenario: The Codex daemon keeps failing
- **WHEN** the Codex RC daemon fails to start 10 times in a row
- **THEN** one report SHALL be filed with area `rc` and the daemon's last error

### Requirement: Reports are grouped and routed to the triage pod

The control plane SHALL group reports by fingerprint (area + normalized error signature) and count
repeats. A NEW fingerprint, or one reopened after being marked fixed, SHALL wake the configured triage pod
with one system message; repeats SHALL only increase the count.

#### Scenario: Twenty pods hit the same bug
- **WHEN** 20 pods file reports with the same fingerprint
- **THEN** there SHALL be one report with count 20 and ONE triage message

### Requirement: Owners see reports from their pods

The cockpit SHALL show the owner the reports filed from their pod: summary, when, and status (open,
fixed, ignored).

#### Scenario: The owner opens Insights
- **WHEN** a report was filed from the owner's pod
- **THEN** Insights SHALL list it with its status
