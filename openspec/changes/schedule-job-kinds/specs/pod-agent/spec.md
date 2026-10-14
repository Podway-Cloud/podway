## ADDED Requirements

### Requirement: A scheduled job is a script, an agent run, or a chat turn

`podway schedule add` SHALL accept exactly one of `--exec "<shell>"` (script job), `--prompt-file <path>`
(agent job) or `--do "<text>"` (chat job), with the existing calendar flags. A script job SHALL run on time
without waiting for the agent and SHALL message the agent only on a non-zero exit or timeout. An agent job
SHALL run as a separate headless agent process with the file as its prompt, SHALL NOT type into the main
session, and SHALL post one summary line when it ends unless its result is `OK`. A chat job keeps today's
behavior, with a one-line trigger. Every run SHALL be logged with its scheduled and started time.

#### Scenario: A plain HTTP call every hour

- **WHEN** a job is added with `--every 60 --exec "curl -fsS …"` and the agent is busy
- **THEN** it runs on time, nothing appears in the chat, and a failed call sends one short message

#### Scenario: A daily AI routine

- **WHEN** a job is added with `--at 08:30 --prompt-file ~/ops/daily-routine.md`
- **THEN** a headless agent run does it at 08:30 even while the main session is busy, writes its log, and
  posts one summary line (or nothing when the result is OK)

#### Scenario: The busy fallback

- **WHEN** a chat job waits 30 minutes on a busy session
- **THEN** it is typed in as today; script and agent jobs never use this fallback
