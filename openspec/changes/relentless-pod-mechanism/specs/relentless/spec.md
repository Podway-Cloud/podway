## ADDED Requirements

### Requirement: A stop must be earned, not assumed

The agent's `Stop` hook SHALL refuse a stop by DEFAULT and allow it only when a legal ending is
provable. Advisory instruction SHALL NOT be relied on for this: it is read once and then competes
with the model's strongest prior, and it measurably fails (748 of ~1508 turns ended as plain stops
during a session whose subject was this mechanism).

When the hook refuses, it SHALL name the next actionable item from the work register rather than
issue a generic instruction to continue, because a generic nudge is the gap the agent fills with
another status report.

#### Scenario: A turn ends with work still queued

- **WHEN** an assistant turn ends, no background task is running, the last tool call was not
  `AskUserQuestion`, and the work register holds at least one actionable item
- **THEN** the hook SHALL block the stop and SHALL state the top actionable item

#### Scenario: A background task makes the stop legal

- **WHEN** a turn ends and that turn started a background task
- **THEN** the stop SHALL be allowed, because the task's completion re-invokes the agent and the loop
  genuinely continues

#### Scenario: A real fork makes the stop legal

- **WHEN** a turn ends and the last tool call of that turn was `AskUserQuestion`
- **THEN** the stop SHALL be allowed
- **AND** a question written as PROSE SHALL NOT satisfy this, because it reads as finished work and
  nothing resumes if the owner says nothing

#### Scenario: An empty register is a legal, reachable idle

- **WHEN** the work register holds no actionable item and nothing is stranded
- **THEN** the stop SHALL be allowed, because manufacturing work to appear busy is worse than idling

#### Scenario: The wall can always be escaped

- **WHEN** the runtime has engaged its own infinite-loop protection (`stop_hook_active`), or the hook
  has refused N consecutive times with no intervening user turn
- **THEN** the hook SHALL allow the stop and SHALL say that it is yielding and why, because a wall
  that cannot be escaped is worse than no wall

#### Scenario: A register that cannot be read fails safe

- **WHEN** the register is missing, malformed, or cannot be parsed
- **THEN** it SHALL be treated as empty and the stop SHALL be allowed, so a broken register can never
  wedge a session

### Requirement: The work register never pollutes a customer repository

The register SHALL resolve in order: a committed register in the repo root when present, otherwise a
location in the pod's HOME outside git, otherwise none. A pod running a BYO repo SHALL NOT have agent
bookkeeping written into that repo by default.

This mirrors the decision already made for scheduler state, which was moved out of the working tree
because BYO repos do not gitignore it and ordinary git operations destroyed it.

#### Scenario: A BYO-repo pod keeps the customer tree clean

- **WHEN** a pod's repo has no committed register
- **THEN** the register SHALL live in the pod's home directory, outside the git working tree
- **AND** it SHALL survive a pod restart, and SHALL NOT appear in the customer's diffs, PRs or history

#### Scenario: A repo that opts in keeps its register

- **WHEN** a repo contains a committed register at its root
- **THEN** that register SHALL be used, so a team that deliberately tracks it keeps it reviewable

### Requirement: Relentless is switchable per pod, and its billed half separately

The mechanism SHALL be switchable per pod, delivered through the existing per-pod spec file, and
SHALL take effect without rebuilding the pod image. It SHALL expose TWO independent switches, because
one half is free and the other spends money, and a single toggle would hide a bill behind a behaviour
change.

#### Scenario: An owner turns the hold off

- **WHEN** an owner disables the hold switch for a pod
- **THEN** the hook SHALL allow stops normally on that pod

#### Scenario: An owner keeps the hold but not the wake

- **WHEN** an owner enables the hold switch and disables the wake switch
- **THEN** the pod SHALL be prevented from stopping mid-work, and SHALL NOT be woken when idle, so no
  billed turn is started on its behalf

#### Scenario: A pod never inherits enforcement by accident

- **WHEN** the per-pod settings are absent or unparseable
- **THEN** both switches SHALL be treated as OFF

### Requirement: An idle pod is woken only when there is something to do

A fleet-wide sweep MAY wake an idle pod, and SHALL do so only when the pod is running, its agent is
idle, it is not waiting on its owner, it has been idle past a threshold, its register holds actionable
work, and it is within its cooldown and per-pod daily cap.

#### Scenario: A pod waiting on its owner is left alone

- **WHEN** a pod's agent state is "waiting for you" or "needs you"
- **THEN** the sweep SHALL NOT wake it, because that state means the agent asked the OWNER something
  and waking it would train the agent to work around the human

#### Scenario: A suspended pod is never woken

- **WHEN** a pod is suspended
- **THEN** the sweep SHALL NOT wake it, because suspension is the owner's explicit choice and waking
  it spends their money against that choice

#### Scenario: An idle pod with nothing to do stays idle

- **WHEN** a pod is idle and its register holds no actionable work
- **THEN** the sweep SHALL NOT wake it

#### Scenario: Waking is bounded

- **WHEN** a pod has already been woken within its cooldown, or has reached its daily cap
- **THEN** the sweep SHALL NOT wake it again, because each wake is a billed turn and a pod that
  ignores nudges must not be hammered
