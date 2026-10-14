## ADDED Requirements

### Requirement: Agents are told which kind of job to use

The runtime rules and `podway schedule` help SHALL state that `--do` is a prompt typed into the chat and
costs a turn, and SHALL give one decision line: no judgement needed → `--exec`; judgement but not the
conversation → `--prompt-file`; needs the conversation or the owner → `--do`. They SHALL say to batch
related AI work into one agent job with a task file, and where runs are logged.

#### Scenario: An agent sets up an hourly health ping

- **WHEN** an agent reads the rules to schedule an hourly `curl`
- **THEN** the rules lead it to `--exec`, not to `--do` or a hand-written startup loop
