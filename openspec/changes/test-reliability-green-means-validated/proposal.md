# Make "green" mean the system is validated

## Why

A three-part audit of the test suite (131 package + 58 web-unit + 25 e2e tests) found that a green
run does NOT mean what the team assumes it means. Concretely, a green PR today proves: every package
builds, the headless unit/integration suites pass under BOTH editions (`build-test` + `oss-check`),
and `apps/web` typechecks. That is real and worth having. It does **not** prove:

1. **The e2e suite passed.** e2e is an **advisory** check (`ci.yml`), so it can be fully red and a PR
   still merges green — this actually happened for **6 straight PRs** (`scripts/check-e2e-health.sh`).
   On a docs/workflow-only PR the required jobs are `if`-skipped and report SUCCESS → such a PR can
   merge having run **no tests at all**.
2. **Security gates enforce at runtime.** The admin/approval gates are asserted by **reading the
   source and grepping for `requireAdmin()` / `requireApprovedUser()`** (`action-auth-gate.test.ts`,
   `admin-billing-gate.test.ts`), not by calling the action as a non-admin and asserting it refuses.
   A gate that is present-but-broken, or a **newly-added ungated action**, passes green.
3. **Money moves correctly.** Billing WRITE paths — `grantCredit`, referral payout, the Stripe
   webhook `handleEvent` (incl. `invoice.payment_failed`→dunning), `syncSubscription` — are untested;
   tests use a fake Stripe. The just-shipped RAM-budget launch gate (#300, gates paying users) has
   only a source-scan unit test and **no e2e**.
4. **The other edition runs.** `packages/selfhost` (serve daemon + `migrate-pg.mjs`) has **zero
   tests**, and `LocalProvider` provisioning is never exercised. Edition-parity is half-verified.
5. **Migrations are safe / real infra works.** `check-migrations.sh` is not in CI; no test asserts a
   migration is backward-compatible (the exact 0039 class we broke prod on). Every provisioning /
   lifecycle test runs against a fake provider — no real Incus/clone/OAuth/relay path can fail CI.

Two failure modes made this concrete and expensive: a stale e2e test (looked for a removed
"Open experiment" link since #290) sat red/quarantined and burned repeated CI cycles, and the CI box
is unstable enough that a shard just died on an **apt race** — noise that `retries: 1` and advisory
status hide, so nobody can trust or read the signal.

## What changes

Make green trustworthy, in four phases (cheapest-highest-value first). The through-line: **every
guarantee a test claims must be exercised at runtime, and the checks that gate a merge must cover the
risks that actually ship bugs.**

- **Phase 1 — Make green HONEST (cheap):** convert the security-gate source-scans into runtime
  behavioral tests + a meta-test that fails when a new `"use server"` mutating action has no gate;
  fix the live dead assertion (`admin-pages.spec.ts:96`) and ban assertion-free / `if(count())`-guarded
  tests and vacuous tests with a lint check; turn on `vitest --coverage` as a signal.
- **Phase 2 — Make e2e TRUSTWORTHY and REQUIRED:** stabilize the box (per-runner HOME, serialize apt)
  enough to promote e2e to a required check — or make `check-e2e-health` a real PR status check;
  add retry/flake reporting so "passed-on-retry" is visible; add the highest-value missing e2e (the
  RAM-budget launch block/allow, and billing add-card→create→charge).
- **Phase 3 — Cover the money and the other edition:** behavioral tests for billing writes
  (`grantCredit`, referral payout, `handleEvent`, `syncSubscription`) with the existing fake Stripe;
  a `LocalProvider` create/destroy test and a `migrate-pg.mjs` test on real Postgres; add `selfhost`
  to `oss-check`; a direct SSRF test for `net-guard.isDisallowedTarget`.
- **Phase 4 — Migration safety + a real-infra net (scheduled, non-blocking):** a migration-safety
  test (read the real `drizzle/*.sql`, assert additive-only) + wire `check-migrations.sh` into CI; a
  nightly real-pod smoke (provision→suspend→resume→destroy on the box); tests for the deploy guards.

## Impact

- Affected: `.github/workflows/ci.yml` (required checks, e2e gating, coverage), `apps/web/test` +
  `apps/web/e2e` (behavioral gate tests, dead-assertion fix, new billing e2e), `packages/control-plane`
  (billing-write + dunning-webhook tests), `packages/provider` (LocalProvider), `packages/selfhost`
  (first tests), `packages/shared` (net-guard), `packages/db` (migration-safety), test tooling
  (coverage, flake reporting), and the lint/grep guards.
- No production behavior changes in Phase 1–3 beyond tests and CI config; Phase 4 adds a scheduled
  lane. The security-gate work may surface a real ungated action — if so, that fix ships with it.
- Specs: `backoffice`/`billing`/`access-control` gain scenarios that assert enforcement is tested at
  runtime; a short testing-standards note lands in the repo rules.
