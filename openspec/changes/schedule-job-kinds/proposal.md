## Why

Every periodic task on a pod becomes a turn typed into the owner's chat (`podway schedule --do`), and it
fires only while the agent is idle. Evidence (2026-10-14, asked both pods):

- **ogo.co.il dev**: 14 jobs; 33 of 55 runs started > 30 min late (medians 1–2.4 h, worst 8.8 h); four
  fired within 10 min as four pasted ~40-line turns in the owner's chat. Owner: *"Can't you run an agent
  to work through all those jobs so I will not see all this mess here?"*
- **ogo.co.il prod**: 4 of 5 jobs were one HTTP call each (no AI); the hourly one alone made 24 chat
  turns a day. It rebuilt them as hand-written `podway startup` loops (own clock math, catch-up windows,
  state file, failure-only alerts) — a second scheduler.
- **podway dev** (this pod) runs `cert-health` as "Run: bash scripts/check-certs.sh" — same mistake.
- Both pods quote the same doc line ("a recurring turn → `podway schedule`; a server/daemon →
  `podway startup`") and read `--do` as a shell command. Nothing says each run costs a chat turn.

This is a platform gap, not two bad agents. v0.8.55's "type a job in after 30 min busy" fixes starvation
but adds MORE job text to a busy chat — it must apply to chat jobs only.

## What Changes

One command, three kinds of job:

| Kind | Flag | Runs as | Chat sees |
|---|---|---|---|
| **Script** | `--exec "<shell>"` | pod-agent runs it on time, as `dev`, in `~`; never waits for the agent | nothing; on a non-zero exit (or timeout) ONE short message with the tail of the output |
| **Agent** | `--prompt-file <path>` | a separate headless agent run (`claude -p` / `codex exec`), same login, prompt = the file | one summary line when it ends; nothing if its last line is `OK` (quiet mode, default) |
| **Chat** | `--do "<text>"` (today) | typed into the main session, as today | a ONE-line trigger ("Run job X — instructions: <file or text>"), not the 40-line block |

- **Every run is logged** (`~/.podway/jobs/runs/<job>/<run>.log` + `ops-runs.jsonl` with scheduled vs
  started time). `podway schedule list` shows last run, how late, result.
- Script and agent jobs keep the scheduler's existing calendar, catch-up and once-a-slot rules — no
  hand-rolled clock math in startup loops.
- **Guardrails for agent jobs**: one run of a job at a time; a timeout (default 30 min); no overlap with
  another agent job (queued); `--every` below 60 min refused (quota). An agent job may only read, or
  write under its own `~/ops/` folder — anything that changes code or the database belongs in a chat job
  (stated in docs + the prompt preamble; not enforced by a sandbox).
- **Busy fallback** (v0.8.55): only for chat jobs.
- **Docs** (runtime-rules.md + `podway schedule` help): one decision line — "needs judgement? no →
  `--exec`; yes but not the conversation → `--prompt-file`; needs the conversation or the owner →
  `--do`"; "batch related AI work into one agent job with a task file"; where runs are logged.
- Existing `--do` jobs keep working unchanged.

## Not in scope (later)

A cockpit "Jobs" list (last run, lateness, result, log) — this change makes the data; a UI can read it.

## Impact

`packages/pod-agent` (scheduler: exec runner, headless agent runner, logs), `podway` CLI (flags, list),
`runtime-rules.md`. Image build. Both editions (pod-agent is shared). Codex pods: `codex exec` path,
verified on test:2.
