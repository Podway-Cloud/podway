## 1. Data

- [x] 1.1 Migration: `pods.claude_login_expires_at`, `auth_notices` (unique), `user.reminder_emails`
- [x] 1.2 Reconcile persists the Claude login expiry from healthz

## 2. Sweep

- [x] 2.1 Tests first: threshold math (incl. missed thresholds → only the most urgent), idempotency across
      runs, stop after renewal, per-owner batching, opt-out, setup-token schedule, unexpected sign-out
- [x] 2.2 Hourly `LoginReminderService` in the gateway: pod system message + batched email

## 3. Surfaces

- [x] 3.1 Email copy on the email-templates layout (3/2/1/expired variants)
- [x] 3.2 Runtime rules (Claude + Codex): relay a login reminder once, with its link
- [x] 3.3 Web: red ribbon at ≤1 day; account setting "Email me before a login expires"

## 4. Verify + ship

- [ ] 4.1 e2e: a pod with expiry in 3 days → one email (mocked sender) + one pod message; reconnect → none
- [ ] 4.2 PR + merge; deploy gateway THEN web (owner yes)

Notes (2026-09-25):
- DEFERRED: the Codex sign-in-failure notice. Codex has no expiry date to key a notice on; it needs its
  own at-most-once key (e.g. the auth.json hash). Tracked here, not built.
- 4.1: covered by unit tests (schedule, batching, opt-out, sign-out) + a real-schema PGlite test of the
  at-most-once claim; a full e2e through the gateway sweep is not built.
- 3.2 (runtime rules) ships with the next pod-base image.
- Main spec updated in place → archive with --skip-specs.
