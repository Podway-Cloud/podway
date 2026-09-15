# Design — make green mean validated

## What the audit found (evidence base)

Three parallel audits (e2e quality, unit/integration quality, CI/critical-path). Verdict: the
**data/control-plane core is genuinely strong** — real Postgres (PGlite via `createTestDb`), one
`PodStore` contract run against BOTH the in-memory and the real Drizzle store, the Incus provider
tested against a faked HTTP boundary but real create/adopt/sleep/resize ordering, real crypto,
sockets, SSRF, scheduler. Keep all of that. The trust gap is concentrated:

### Required gate under-covers the real risks
- `ci.yml`: required = `build-test` + `oss-check` only; **e2e is advisory** (documented red for 6
  PRs). Skipped required jobs report SUCCESS → a no-code PR runs no tests.
- No coverage tooling anywhere → gaps are invisible.
- `retries: 1` + no flake reporting → passed-on-retry ≡ clean pass.
- Box instability: two shards share one `builder` HOME on one box → pnpm `ENOTEMPTY`, apt races
  (just observed: shard died renaming `/var/cache/apt/srcpkgcache.bin`), a 35-min hang.

### Tests that assert less than they claim (~18 source-scanners + guards)
- **Security gates by grep:** `action-auth-gate.test.ts` / `admin-billing-gate.test.ts` (source half)
  / `t3-harness-guard.test.ts` / `posthog-boundary.test.ts` assert the source *contains* a call.
  Passes if the gate is present-but-dead or if a NEW action ships ungated.
- **Silent no-ops:** `admin-pages.spec.ts:96` targets a `button` that renders as a `link` and a
  "Created" column that doesn't exist, wrapped in `if (await header.count())` → "pods table is
  sortable" passes having tested nothing. Same pattern is the risk to hunt.
- **Vacuous:** `environment-spec.test.ts` loops over an empty list; `environments-conform.test.ts`
  `continue`s past any env missing its yaml; `dashboard.browser.test.ts` `skipIf(!browser)` skips
  its browser-free assertions too.
- **Brittle copy/CSS/JSX-text** assertions (landing bundles, dashboard-presentation, walkthrough,
  t3-ui-gating) — refactor friction, little bug-catching; delete or convert to role/behavior.

### Untested risk that ships bugs
- Billing WRITES (`grantCredit`, referral payout, `handleEvent` webhook, `syncSubscription`).
- The #300 RAM-budget launch gate has no e2e (only a source-scan unit test).
- `packages/selfhost` (0 tests) + `LocalProvider` provisioning (0 tests) → OSS runtime unverified.
- `net-guard.isDisallowedTarget` (SSRF classifier) — tested only via the relay's copy, not directly.
- Migration backward-compat safety; the deploy guard scripts themselves.

## Approach, by phase

### Phase 1 — honesty (no infra, high leverage)
- **Runtime gate tests:** for each guarded server action / route, invoke it with an
  unapproved/non-admin/other-owner session and assert it throws/redirects — the model already exists
  in `admin-billing-gate.test.ts:48-86` and `account-ram-cap.test.ts`. Replace the `readFileSync`
  `.toContain(...)` assertions.
- **Ungated-action meta-test:** enumerate every exported `"use server"` action (glob `apps/web`),
  and fail if one is a mutating action not covered by the gate registry — this catches the *next*
  ungated action, which per-name greps never will.
- **Ban silent no-ops:** an ESLint rule / grep check in CI that flags e2e assertions wrapped in
  `if (await …count())` and test bodies with zero `expect`. Fix `admin-pages.spec.ts:96`.
- **Delete/convert** the vacuous + brittle-copy tests (list in tasks).
- **Coverage signal:** `vitest run --coverage` (v8) on `build-test`, published as an artifact, not
  yet gating — so billing-write/selfhost/net-guard gaps surface as uncovered lines.

### Phase 2 — trustworthy, required e2e
- **Stabilize the box first** (a required-check promotion is only honest if the suite can produce a
  verdict): give each runner its own HOME/work dir, serialize apt (or bake tmux into the image), so
  the ENOTEMPTY/apt races stop. Then EITHER promote `e2e` to required, OR make `check-e2e-health` a
  real PR status check that fails the PR when e2e is red — pick one, but stop letting red e2e merge.
- **Flake visibility:** emit Playwright's `flaky`/retry count per run into the health report; keep a
  short, dated quarantine list with an expiry (a quarantined test that isn't fixed in N days fails CI)
  so quarantine can't become the graveyard it just was.
- **Highest-value new e2e:** the RAM-budget launch gate (no-card user at the ceiling is BLOCKED from
  Create; carded user is ALLOWED — seed `billingAccounts.hasCard`, mirror the nonpayment seam), and
  billing add-card → create pod → charge (the money-in path, using the fake Stripe).

### Phase 3 — money + the other edition
- **Billing writes:** exercise `grantCredit` (ledger + mirror + idempotency), referral payout
  maturity, `handleEvent` for `invoice.paid`/`payment_failed` (the dunning entry point), and
  `syncSubscription`, all against real DB + the existing injected fake Stripe.
- **OSS runtime:** a `LocalProvider` create/exec/destroy test that mocks only the Docker boundary
  (mirroring `incus-provider.test.ts`), and a `migrate-pg.mjs` idempotency test on an ephemeral real
  Postgres; add `@podway/selfhost` to `oss-check`'s filter.
- **SSRF:** a direct `isDisallowedTarget` table test in `shared` (loopback/private/link-local/CGNAT/
  IPv6-ULA/metadata), so the security-critical original is tested at its source.

### Phase 4 — migration safety + a real-infra net (scheduled)
- **Migration safety test** (`packages/db`): read the real `drizzle/*.sql`, assert additive-only
  (no `DROP COLUMN` / `NOT NULL`-without-default / destructive rewrite on an existing table); wire
  `check-migrations.sh`'s ordering dry-run into CI against ephemeral Postgres.
- **Nightly real-pod smoke:** one real Incus pod through provision→suspend→resume→destroy on the box
  — the only thing that catches the real REST-client/WireGuard/PTY class that is mock-only today.
- **Guard tests:** bats/shell unit tests for `deploy-app.sh` (dirty-tree refusal, gateway-count
  invariant), `pre-push`, `check-0audit.sh` (ceilings, `[no-spec]` bypass), `check-migrations.sh`.

## Non-goals / calls to make
- Not aiming for a coverage % gate in this change (adopt the signal first; gate later once the number
  is meaningful). 
- Real-infra tests stay on a **schedule**, not the PR gate — a PR must not depend on a live box VM.
- Deleting brittle copy/CSS tests is a judgment call per test; default to convert-to-behavior, delete
  only the pure change-detectors.

## Open questions for the owner (in tasks)
- Promote e2e to **required** vs. keep advisory but gate on `check-e2e-health` — which?
- Is fixing box stability in-scope here, or a separate infra task this change just depends on?
- How aggressive on deleting the ~40 marketing-copy assertions (they do catch accidental copy loss)?
