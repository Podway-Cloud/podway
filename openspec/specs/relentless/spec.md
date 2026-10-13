# relentless Specification

## Purpose

Relentless is the mechanism that keeps a pod WORKING rather than idling at a prompt. A pod runs 24/7
and its owner is usually elsewhere, so an agent that stops the moment it can wastes the machine they
are paying for.

The design rests on one measured claim: **advisory instruction cannot deliver this, only enforcement
can.** Measured on a live pod (2026-09-06), 748 of ~1508 assistant turns ended as plain stops — no
question asked, no background task running, work still open — during a session whose subject was
fixing relentless. The cause is not defiance but the model's strongest prior: answer, then yield to
the human. A rule is read once and then competes with everything after it, so it decays as context
grows; a hook does not.

Two properties follow, and both are load-bearing:

- The mechanism must be **switchable per pod**, and its free half must be separable from the half
  that spends money, or a behaviour toggle silently becomes a billing decision.
- The mechanism must **fail loudly, never silently**. Every failure of a wall looks identical to a
  wall with nothing to block, so a disarmed hook is indistinguishable from a working one — which is
  exactly how it was found switched off, unnoticed, for an hour mid-trial.


## Requirements

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

#### Scenario: The setting reads its own state without being opened

- **WHEN** an owner looks at a pod's settings
- **THEN** the switches SHALL sit behind ONE row, in the tab that governs what the pod's agents DO,
  because this is an infrequent, consequential choice that must not read as two everyday toggles
- **AND** that row's DESCRIPTION SHALL name BOTH switches and their states, so they are legible
  WITHOUT opening the dialog and neither can go quiet in the state worth noticing
- **AND** the dialog SHALL warn when the pod is set to be woken but not held, since it will then wake,
  take one turn and be free to stop again — a legitimate choice, but rarely the intended one

The description carries the state because this mechanism's failures are SILENT: a disarmed hook
behaves exactly like an armed one with nothing to block, and it sat switched off for an hour while
being reported as working (2026-09-06). A switch reading "on" proves nothing; a description that
says what the pod is doing can be checked at a glance.

#### Scenario: A toggle takes effect on the running pod, not at the next reboot

- **WHEN** an owner changes a pod's agentic behavior while the pod is running
- **THEN** the change SHALL be pushed to that pod, so the next stop already obeys it
- **AND** the pod SHALL read the LIVE copy of its spec rather than the boot-time backup, since only
  the live copy receives such pushes
- **AND** a push that cannot be delivered — the pod is suspended or unreachable — SHALL NOT fail the
  change; the stored value stays authoritative and the pod picks it up when it next reads its spec

A control that appears to do something and does not is worse than no control. Storing the flag alone
left a running pod on its launch-time behaviour, so the switch would have looked dead to the owner
who had just moved it.

#### Scenario: A switch that is not wired yet says so

- **WHEN** a switch in the dialog has no mechanism behind it yet
- **THEN** it SHALL be shown disabled and labelled as unavailable, rather than accepting a change
  that is silently stored and never acted on
- **AND** it SHALL become usable by enabling the mechanism, without the dialog needing rework

A stored preference nothing reads is indistinguishable from a working one, which is the failure mode
this whole capability keeps having. Saying so is cheaper than an owner discovering it.

#### Scenario: A pod never inherits enforcement by accident

- **WHEN** the per-pod settings are absent or unparseable
- **THEN** both switches SHALL be treated as OFF

### Requirement: An idle pod is woken like an owner typing "next?"

When the pod's `relentless.wake` is on, the pod-agent (autopilot, every 30 s) SHALL type a "next?" wake
into the agent only when: the agent is idle (not busy/shell) for at least 20 minutes, it is NOT waiting
on its owner (no open question or dialog), at least 20 minutes have passed since the last wake, and fewer
than 8 wakes happened that day. The agent judges what to do — no register is required (owner, 2026-10-11:
"next?" works because the agent finds work itself). Two wakes in a row after which nothing changed in
`~/work` (git HEAD + dirty files, or the newest file times when `~/work` is not a repo) SHALL pause waking until the owner writes again. The pod rules tell the agent
that when nothing is worth doing it asks ONE question with no "(Recommended)" option and stops.

#### Scenario: A pod waiting on its owner is left alone
- **WHEN** the agent has an open question or dialog
- **THEN** it SHALL NOT be woken

#### Scenario: Wakes that produce nothing stop
- **WHEN** two consecutive wakes leave `~/work` unchanged
- **THEN** waking pauses until a new owner message appears in the transcript

### Requirement: "Always choose recommended" only answers safe questions

When the pod's `relentless.autopick` is on (off by default, warned in the cockpit), the pod-agent SHALL
answer an open AskUserQuestion only after it has waited 10 minutes with no reply, and only when EVERY
question's FIRST option ends in "(Recommended)", no question is multi-select, and no question or option
mentions a gated action (push, deploy, merge, delete, spend, publish, production, secrets…). It SHALL read
the question box from the agent's SCREEN (Claude Code writes the question to the transcript only after it
is answered) and check EACH screen before each Enter — the highlighted option 1 must end in
"(Recommended)", and a review screen must list only recommended answers — stopping at the first screen that
fails (nothing is submitted then) or when the box closes (verified on Claude Code 2.1.283: one Enter per
question, plus one on the review screen for 2+ questions). It SHALL try each question box only once. The pod rules tell agents to mark NO option "(Recommended)" on an owner decision, so
those always wait for the owner. (Background: the same selection happened by ACCIDENT on 2026-10-06.)

#### Scenario: An owner decision is never auto-answered
- **WHEN** a question's options carry no "(Recommended)", or it mentions deploying
- **THEN** it waits for the owner, however long

### Requirement: The hold switch governs the rules and skill for every agent

With the hold switch OFF, a pod SHALL carry no relentless rule file, no relentless skill, and no relentless
section in the runtime rules for ANY of its agents (Claude and Codex), and copies installed while it was ON
SHALL be removed. Changing the switch SHALL refresh the running pod's config in place, without restarting
its agents. Until 2026-10-03 the switch only disarmed Claude's hooks: Codex kept the rules and skill, and
Claude kept the rule text.

The removal SHALL NEVER touch the user's repository: on a pod with its own GitHub repo, `~/work/.claude`
is the user's tracked content (the podway repo itself tracks `.claude/skills/relentless`), so only
podway-owned copies are removed there — `~/work/.claude` copies only on a scaffold pod (no repo). The
hooks SHALL read the switch from the pod spec FIRST; the legacy `~/.podway/relentless.json` file counts
only when the spec carries no `relentless` key, so a stale local file can never override the owner.

#### Scenario: Hold off on a pod with its own repo
- **WHEN** the hold is off on a pod whose spec has a `githubRepo`
- **THEN** files under `~/work/.claude` SHALL be left untouched

#### Scenario: A stale local file disagrees with the dashboard
- **WHEN** the spec says hold off and `~/.podway/relentless.json` says hold on
- **THEN** the stop and session-start hooks SHALL treat relentless as OFF

The pod's copy of the switch SHALL be re-synced from the database on every image update and every
config refresh (including the drift sweep), so a live push that missed — e.g. the pod was restarting —
can never leave the pod on a stale value. (podway dev kept `hold:false` across an update while the
owner had it ON, 2026-10-06.)

#### Scenario: A missed live push is healed on the next update or refresh
- **WHEN** the dashboard says hold ON but the pod's spec still says OFF
- **THEN** the next image update or config refresh SHALL write hold ON into the pod's spec

#### Scenario: Hold switched off
- **WHEN** the owner switches the hold off for a pod with Claude and Codex
- **THEN** neither agent's rules (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `.claude/rules`) nor skills SHALL contain the relentless mechanism

#### Scenario: Hold switched back on
- **WHEN** the owner switches the hold on again
- **THEN** both agents SHALL get the rules and skill back on the refresh that follows
