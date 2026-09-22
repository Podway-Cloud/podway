# Tasks — make green mean validated

## Phase 1 — Make green HONEST (cheap, do first)
- [~] 1.1 Convert `apps/web/test/action-auth-gate.test.ts` from source-scan to RUNTIME: call each
  guarded server action with an unapproved/other-owner session and assert it rejects. Model:
  `admin-billing-gate.test.ts:48-86`. DONE for the money paths — `startAddCard` + `markCardSaved`
  now proven at runtime in `action-gate-runtime.test.ts` (refuse when the gate rejects, never touch
  Stripe/credit; approved user gets through; inert when billing off), verified to FAIL against a
  removed gate. Their source-scans were dropped from action-auth-gate.test.ts. REMAINING: launchPod's
  runtime conversion (actions.ts has a heavy import graph to fake) — still token-covered by 1.3.
- [ ] 1.2 Convert the source-scan half of `admin-billing-gate.test.ts` + `t3-harness-guard.test.ts`
  + `posthog-boundary.test.ts` to runtime/behavioral where a runtime seam exists; keep as source-scan
  ONLY where there is genuinely nothing to invoke (and label it as a policy check, not a gate test).
- [x] 1.3 Ungated-action meta-test — `apps/web/test/ungated-action-meta.test.ts` discovers every
  `"use server"` module under apps/web and fails if an exported action is neither gated inline
  (`require{User,ApprovedUser,Admin}`), gated via a local helper (e.g. `assertOwnedPod`), nor in an
  explicit allowlist (one entry: `billingEnabled`, a public read-only flag). Verified to FAIL on an
  injected ungated action. A new ungated action now fails CI with no per-action test edit.
- [ ] 1.4 Fix the live dead assertion `apps/web/e2e/admin-pages.spec.ts:96` (target the real `link`
  role + existing columns; remove the `if (await …count())` guard so it actually tests sortability).
- [ ] 1.5 Add a CI lint/grep guard: fail on e2e assertions wrapped in `if (await …count())` and on
  test bodies with zero `expect`.
- [ ] 1.6 Delete/convert vacuous tests: `shared/test/environment-spec.test.ts` (empty loop),
  `environments-conform.test.ts` (continue-past-missing), `relay/test/dashboard.browser.test.ts`
  (skipIf hides browser-free assertions), `shared/test/relay.test.ts` (literal-equals-literal).
- [x] 1.7a Coverage provider installed (`@vitest/coverage-v8`) + a root `pnpm coverage` script (v8,
  text + json-summary). First numbers confirm the audit: `billing.ts` is **44.8%** covered — the
  money-movement writes (`grantCredit`, `handleEvent`, `syncSubscription`) are the uncovered ranges.
- [x] 1.7b Non-gating coverage step in `build-test` (core packages: control-plane/shared/db;
  `continue-on-error`) + uploads `coverage-summary` artifact. A gate comes later (pairs with 2.2).

## Phase 2 — Make e2e TRUSTWORTHY and REQUIRED
- [x] 2.1 Stabilized the CI box in ci.yml (no live-runner surgery): (a) the "Install tmux" step now
  skips when tmux is present and drops `apt-get update`, so the two shards stop racing the apt cache
  (tmux is already installed on the box) — that was #301's e2e killer; (b) a per-runner pnpm store
  (`npm_config_store_dir: /home/builder/.pnpm-store/${{ runner.name }}`) on build-test/oss-check/e2e,
  so the two runners sharing /home/builder stop racing one store (the ENOTEMPTY). Watch a few runs;
  then 2.2 (flip e2e to required — owner toggles branch protection).
- [ ] 2.2 DECISION (owner): promote `e2e` to a required check, OR make `check-e2e-health.sh` a real
  PR status check that fails a PR on red e2e. Implement the chosen one so red e2e can't merge.
- [ ] 2.3 Emit Playwright retry/`flaky` counts per run into the e2e-health report; a passed-on-retry
  is reported distinctly from a clean pass.
- [ ] 2.4 Quarantine discipline: a dated quarantine list with an expiry — a still-skipped test past
  its date fails CI (so quarantine can't rot, as the Experiments test did).
- [ ] 2.5 New e2e — RAM-budget launch gate: a no-card user at the RAM ceiling is BLOCKED from Create
  (sees the upgrade CTA); a carded user is ALLOWED. Seed `billingAccounts.hasCard`.
- [ ] 2.6 New e2e — billing add-card → create pod → charge (money-in path, fake Stripe).

## Phase 3 — Cover the money and the other edition
- [x] 3.1 `packages/control-plane` billing WRITE tests: `grantCredit` (ledger + mirror + idempotent),
  referral payout maturity (`maybePayReferrer`), `handleEvent` (`invoice.paid` + `invoice.payment_failed`
  → dunning kick), `syncSubscription` — real DB + the injected fake Stripe already in `billing.test.ts`.
- [x] 3.2 `LocalProvider` create/exec/destroy test (mock only the Docker boundary, mirroring
  `incus-provider.test.ts`).
- [ ] 3.3 `packages/selfhost` — `migrate-pg.mjs` idempotency test on an ephemeral real Postgres; add
  `@podway/selfhost` to `oss-check`'s package filter.
- [x] 3.4 `packages/shared` — a direct `isDisallowedTarget` (SSRF) table test at its source.

## Phase 4 — Migration safety + a real-infra net (scheduled, non-blocking)
- [x] 4.1 `packages/db` migration-safety test: read the real `drizzle/*.sql`, assert additive-only
  (no DROP COLUMN / NOT NULL-without-default / destructive rewrite on existing tables).
- [x] 4.2 Wire `check-migrations.sh` ordering dry-run into CI against ephemeral Postgres.
- [x] 4.3 Nightly real-pod smoke: provision→suspend→resume→destroy one real Incus pod on the box.
- [x] 4.4 Guard-script tests (bats/shell): `deploy-app.sh` (dirty-tree refusal, gateway-count
  invariant), `pre-push`, `check-0audit.sh` (ceilings + `[no-spec]` bypass), `check-migrations.sh`.

## Cross-cutting
- [~] 5.1 Update specs + rules. DONE: `access-control` spec gained a "gate is verified at runtime, and
  a new ungated action fails the build" scenario; `.claude/rules/testing-standards.md` added (no
  source-scan gates, no vacuous tests, prove-the-test-fails, quarantine-expiry) and imported in
  CLAUDE.md. REMAINING: the matching `backoffice`/`billing` runtime scenarios.
- [ ] 5.2 Each phase lands as its own PR (Phase 1 first — it's the cheapest trust win). Verify each
  new/changed test FAILS against the bug it guards before it's considered done.
