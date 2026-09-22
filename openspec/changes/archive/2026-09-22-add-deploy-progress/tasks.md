## 1. Protocol + pod-agent surfacing

- [x] 1.1 Add optional `setupProgress?: string | null` to the health/agent payload type in `packages/shared/src/protocol.ts` (documented as: current env-declared setup milestone; absent once setup is done; back-compat optional). — Landed on `PodHealth` in `packages/provider/src/provider.ts` instead (see the implementation note in the change's PR/summary): that's where the pod-level `/healthz` fields (`agentWaitingFor` etc.) are actually typed; `PodAgentState` in `protocol.ts` is per-agent WS status and isn't the right shape for a pod-level field.
- [x] 1.2 In `packages/pod-agent`, read the current marker: prefer `~/.podway-progress` (bare message) else the last `podway-progress:` line in `~/.podway-setup.log`; only while `~/.podway-setup-running` exists and `~/.podway-setup-done` does not.
- [x] 1.3 Surface it on `/healthz` as `setupProgress`, passed through the existing health sanitizer (`cleanStr`, `MAX_HEALTH_STR`) so it is control-char-stripped + length-capped.
- [x] 1.4 Unit-test the reader: marker present → value; `.podway-progress` wins over the log tail; setup-done → null; over-long/control-char input → sanitized.

## 2. Onboarding rendering

- [x] 2.1 In the web onboarding "Starting your agent" step, when `setupProgress` is present render it as the current milestone line (in place of / alongside the fixed "enabling remote control…" copy); when absent, unchanged.
- [x] 2.2 Confirm the control-plane/gateway agent-state path carries the new field through to the cockpit (it rides the existing health pass-through; add the field where the payload is re-typed if needed). — Found and fixed the re-typing spot: `pod-cockpit.tsx`'s `useQuery` `select` narrows `PodLiveSignals` down to `PodCardLive` and was dropping unlisted fields; added `setupProgress` to both `PodCardLive` (`apps/web/lib/pod-visual-state.ts`) and the `select` mapping.
- [ ] 2.3 Verify with a screenshot/e2e that a pod reporting `setupProgress` shows the milestone and one reporting none shows the default. — Not done (out of scope for this pass per instructions); `tsc --noEmit` is clean and the data path was traced end-to-end instead.

## 3. n8n as the first emitter

- [x] 3.1 Have `environments/n8n` emit its milestones — from the `setup` steps and/or `bin/app-admin.sh deploy`: `podway-progress: Pulling n8n…` before the pull, `Starting the database…` after Postgres is healthy, `n8n is live` on `DEPLOYED healthy` — and write the current one to `~/.podway-progress`.
- [ ] 3.2 Launch-test on a real n8n pod: confirm the milestones appear in onboarding during the deploy, and clear when setup completes. — Left for velsa per instructions.

## 4. Docs + spec

- [x] 4.1 Document the `podway-progress:` convention for env authors (a short note in the env-authoring/playbook docs): how to emit, that it's optional, and never to put secrets in a marker. — One-line gotcha added to `docs/runbooks/playbook-authoring.md`'s "Gotchas already paid for" list.
- [ ] 4.2 `openspec validate add-deploy-progress --type change` green; archive after the launch-test. — Validate is green now; archive left for velsa after 3.2's launch-test (archiving syncs the delta specs into `openspec/specs/`, which shouldn't happen before the real-pod check).
