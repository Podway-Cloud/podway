- [x] 1 scheduler: job kind field; exec runner (timeout, output tail, failure message); per-run log + scheduled/started times
- [x] 2 headless agent runner (`claude -p` with the pod's permission flag and the SAME env rules as boot — strip `ANTHROPIC_API_KEY` in subscription mode, verified: with it set, `claude -p` fails "Invalid API key"; `codex exec` on Codex pods); one-at-a-time queue; timeout; quiet `OK`
- [x] 3 CLI: `--exec` / `--prompt-file`, `--every` < 60 refused for agent jobs; `schedule list` shows last run, lateness, result
- [x] 4 busy fallback → chat jobs only; one-line chat trigger
- [x] 5 runtime-rules.md + help text: decision line, batching, logs
- [x] 6 tests (prove-fail) + test:1 (Claude) and test:2 (Codex) live runs; then offer the ogo.co.il pods + podway dev's own cert-health job a move

- Live 2026-10-14: test:1 (Claude) exec + agent (OK silent / line posted) while the main session was busy; chat one-liner; test:2 (Codex) `codex exec` agent job + exec job. Owner-pod migration (ogo.co.il, podway dev cert-health) is OFFERED, not done.
