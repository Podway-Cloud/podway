## 1. Relentless switch really off

- [x] 1.1 Test first: pod-init drops `rules/relentless.md` + `skills/relentless/` when hold is off, keeps them when on
- [x] 1.2 runtime-rules.md: wrap the "Always go" section in markers; refresh steps strip it when hold is off (Claude CLAUDE.md + Codex AGENTS.md); test with hold on/off
- [x] 1.3 Remove stale relentless rule/skill copies (~/.claude, ~/work/.claude, ~/.codex) when hold is off, on boot and in podway-refresh; test
- [x] 1.4 setAgenticBehavior refreshes the running pod's config (refreshPodConfig) after the DB write; control-plane test
- [x] 1.5 Wake to work: owner decision 2026-10-04 "keep the switch disabled" — it already ships disabled with "Not available yet" (WAKE_AVAILABLE=false); no change
- [x] 1.6 Verify on test:1: switch off → no relentless in CLAUDE.md, AGENTS.md, skills, rules; on → back — done 2026-10-04 with the new scripts pushed by hand: off → 0 copies, on → back in both agents, off → 0

## 2. Messages reach the right agent

- [x] 2.1 Investigated: a busy main agent still accepts typed input (queued), so first-ready-window is right; the real gap was the app session — tests for the codex app path written first
- [x] 2.2 Implement in agent-messaging deliverMessages; verify on a two-agent test pod
- [x] 2.3 Research: can a message reach the Codex app-server session (the one the ChatGPT app drives)? Write findings; build if feasible

## 3. Fewer Codex setup steps

- [x] 3.1 Enable → sign-in → pairing chained into one guided flow (no hunting for the next button)
- [x] 3.2 Phone: tappable chatgpt.com/codex/pair link next to the code (built; owner to test that the app catches it on a real phone)
- [x] 3.3 Researched: the daemon protocol has no pairing-status request (only remote-control connection status). Usable signal instead: thread/loaded/list non-empty = an app session is open. "I've paired this" stays for now
- [x] 3.4 Daemon now starts in /home/dev/work (was / or /root); owner to confirm the desktop app's Source folder default
- [ ] 3.5 Screenshots of the new flow to the owner before shipping

## 4. Ship (owner yes per step)

- [ ] 4.1 PRs + merge; pod-base image; gateway + web deploy
