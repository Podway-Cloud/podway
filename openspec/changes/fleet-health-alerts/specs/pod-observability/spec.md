## ADDED Requirements

### Requirement: Ops is alerted when a pod is unhealthy

The control plane SHALL check every running pod every 15 minutes and SHALL send ONE ops Telegram alert
when a pod newly shows: Remote Control `down`, a dead agent (2 checks), scheduled jobs overdue more than
2 hours, disk above 90%, or an unreachable pod-agent (2 checks). It SHALL send one "resolved" message
when the problem clears, and SHALL NOT repeat an open alert.

#### Scenario: Remote Control restore gives up

- **WHEN** a pod's `rcState` becomes `down`
- **THEN** ops gets one Telegram message naming the pod by its owner-given name and the problem

#### Scenario: A problem clears

- **WHEN** the same pod reads `active` again
- **THEN** ops gets one "resolved" message, and no further alerts for it
