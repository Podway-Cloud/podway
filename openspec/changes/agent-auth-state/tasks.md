## 1. Tests first (must FAIL on current main)
- [x] 1.1 `classifyAgentAuth` + `AgentAuthState` types in `packages/shared`; exhaustive table test over
      agent × mode × {creds absent/valid/expired} × {login running/exited, value age} × {needsReauth} ×
      {T3 on/off}
- [x] 1.2 `scripts/incus/auth-e2e.sh` (scratch-pod recipe from app-smoke.sh) implementing design D8
      steps 1–6 for Claude and Codex
- [x] 1.3 Run 1.2 against the current pod-base image; record which steps fail (expected: Codex relogin,
      stale Codex code after exit, setup-token without T3)
      RESULT (pod-base v0.8.34, 2026-09-24): 12 fail / 2 pass. Real bugs reproduced via legacy fields:
      Codex relogin `unsupported-agent`; Codex serves a dead code after its login exits (GTM bug);
      NEW — Claude also serves its OAuth URL after its login exits. Other fails = image predates
      `authState` (legacy authed flips correctly). Claude relogin passes today.

## 2. pod-agent
- [x] 2.1 `agentAuth` getter over pod-spec (D6); replace every boot-time read
- [x] 2.2 Captured values `{value, window, issuedAt}`: last match, owning window only, drop on exit /
      timeout / expiry; clear in `/agent/restart` and `/agent/relogin` (D4)
- [x] 2.3 `/agent/relogin` for Codex + stripped commands for both; per-agent signin window; close on
      land or expiry (D5)
- [x] 2.4 `maybeRespawnAuthed` skips an agent with a relogin in flight
- [x] 2.5 Report `authState` (+ value, issuedAt, expiresAt, reason) on `/healthz` via the classifier

## 3. control-plane
- [x] 3.1 Delete `setupTokenAuthed`; pass T3 control into the classifier input instead
      (control plane attaches `authState` to every agent — pod's own, or `legacyAgentAuthState` for older images; the mask is gone)
- [x] 3.2 `reconnectAgent` / `completeSetupToken` / `revertToSubscription` poll `authState` for the
      target before returning; bounded timeout → error (D7)
- [x] 3.3 `completeSetupToken` no longer starts a T3 enable (only the renew-then-T3 wizard does)

## 4. web
- [x] 4.1 Card renders from `authState` (fallback to old mapping when absent); remove auth ordering from
      `agentCardState`
- [x] 4.2 One sign-in wizard for both agents: Codex device code + Open OpenAI + countdown + Get a new
      code; remove #344's inline Codex block and the broken `codex-device` link rendering
- [x] 4.3 Wizards close only on `signed-in`; Renew offered only under T3; `wrong-mode` → "Sign in with
      your subscription"

## 5. Spec + ship
- [ ] 5.1 Fold the old per-incident `agent-credentials` scenarios into the transition scenarios
- [x] 5.2 1.1 and 1.2 green; full test suites green
      RESULT (2026-09-24): auth-e2e 12/12 on a scratch pod (pod-base + this branch's pod-agent bundle via
      POD_AGENT_BUNDLE). Suites: shared 166, pod-agent 373, control-plane 480, web 675 (3 failures are
      pre-existing on main, unrelated), e2e cockpit/rc-recovery/t3-flows/pod-states/onboarding 25 (+1 flaky
      tab-layout test, passes on retry). Step 3 now asserts the real invariant: a value is served only from
      a RUNNING login (the launcher retries a fast-dying login once; the pod re-launches a dead Claude login).
- [ ] 5.3 Ship: pod-base build (pod-agent) + gateway/web deploy; update GTM and t3tt
- [ ] 5.4 **Owner acceptance:** one real Codex sign-in on GTM and one real Claude sign-in on t3tt, both
      reaching `signed-in` without manual help
