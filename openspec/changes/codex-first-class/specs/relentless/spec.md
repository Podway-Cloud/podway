## ADDED Requirements

### Requirement: The hold switch governs the rules and skill for every agent

With the hold switch OFF, a pod SHALL carry no relentless rule file, no relentless skill, and no relentless
section in the runtime rules for ANY of its agents (Claude and Codex), and copies installed while it was ON
SHALL be removed. Changing the switch SHALL refresh the running pod's config in place, without restarting
its agents. Until 2026-10-03 the switch only disarmed Claude's hooks: Codex kept the rules and skill, and
Claude kept the rule text.

#### Scenario: Hold switched off
- **WHEN** the owner switches the hold off for a pod with Claude and Codex
- **THEN** neither agent's rules (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `.claude/rules`) nor skills SHALL contain the relentless mechanism

#### Scenario: Hold switched back on
- **WHEN** the owner switches the hold on again
- **THEN** both agents SHALL get the rules and skill back on the refresh that follows
