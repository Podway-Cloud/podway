## ADDED Requirements

### Requirement: Auto-compact cannot be disabled
A pod agent SHALL always run with Claude Code auto-compaction enabled. The cockpit MUST NOT offer a
control to disable it, and the setting applied to the pod MUST be `enabled` regardless of any stored
or requested value — because auto-compaction is what keeps a 24/7 session from dying at the context
limit.

#### Scenario: No off switch in the cockpit
- **WHEN** an owner opens the Claude settings for a pod
- **THEN** there is no control to turn auto-compaction off

#### Scenario: A stored "off" is ignored
- **WHEN** a pod has a stored auto-compact-disabled value from before this change
- **THEN** the settings applied to the pod still enable auto-compaction

### Requirement: A context-overflowed session is auto-detected
The pod agent SHALL detect when its Claude session has hit the context limit — the state where every
turn fails with "prompt is too long" / "context limit reached" — from the agent pane, debounced so a
healthy session is never flagged.

#### Scenario: Stuck at the context limit
- **WHEN** the agent pane shows the context-limit state across consecutive checks and the agent is not
  advancing
- **THEN** the pod agent records the session as context-overflowed and begins recovery

### Requirement: Recovery strips un-compactable payloads then compacts
Recovery SHALL remove the un-compactable giant payloads (base64 image tool-results) from the active
transcript — backing it up first — and then trigger a compaction, falling back to an agent restart if
the limit persists. Recovery MUST be bounded (rate-limited, never looping) and logged.

#### Scenario: Images are the cause
- **WHEN** recovery runs on a session flooded with screenshots
- **THEN** the image payloads are replaced with placeholders in a backed-up transcript, a compaction
  is triggered, and the session resumes with its conversation preserved as a summary

#### Scenario: Recovery is bounded
- **WHEN** a pod hits the context limit repeatedly in a short window
- **THEN** recovery does not loop; the pod escalates to an owner-visible health note instead

### Requirement: The owner is never left at a dead prompt without a signal
When a context-overflow is detected, the outcome SHALL reach the owner — either the session recovers
on its own, or, if recovery cannot fit the session, a health note tells the owner what happened and
that the conversation was reset.

#### Scenario: Recovery cannot fit the session
- **WHEN** even a trimmed, compacted session still exceeds the limit
- **THEN** a fresh session is started AND a health note records that the prior conversation was reset
