## ADDED Requirements

### Requirement: Idle pods can update themselves at night

An account MAY turn on "Update idle pods automatically at night". When on, the platform SHALL run the
existing idle bulk update for that account once a night between 03:00 and 05:00 in the owner's
timezone, with the same eligibility rules (behind, running, idle, not T3, per-pod auto-update not off).
It SHALL send the owner one summary of what was updated and what was skipped and why. Default: off.

#### Scenario: A pod is busy at night

- **WHEN** the night run finds a pod whose agent is busy
- **THEN** it SHALL skip that pod and list it as "busy" in the summary

#### Scenario: Setting off

- **WHEN** the account setting is off
- **THEN** no pod of that account is updated without a click
