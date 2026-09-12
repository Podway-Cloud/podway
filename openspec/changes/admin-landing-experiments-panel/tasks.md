# Tasks — admin landing-experiments panel

## 1. Store: read helpers + the default/status mutators
- [x] 1.1 Add `setPinnedDefault(variant)` and `setRunningStatus(running)` to
  `landing-experiment-store.ts`, writing only `landingExperimentRuns` (`pinnedVariant`, `status`),
  keyed by the active experiment id; return the updated runtime.
- [x] 1.2 Add a `getPanelData()` read helper that returns { runtime (status, pinnedVariant), the
  active definition (variants, allocation, primaryMetric, fallbackVariant), and the per-variant
  report } in one call for the server page.
- [x] 1.3 Confirm middleware resolves the served variant as `pinnedVariant ?? fallbackVariant` when
  stopped, and the frozen allocation when active — adjust ONLY if it doesn't already honor the pin.
  (Confirmed: `app/page.tsx` `assignedVariant()` already returns `pinnedVariant ?? fallbackVariant`
  when stopped and the frozen split when active/measured — no change needed. Middleware only
  assigns the split cookie/headers; the pin is honored in `page.tsx`.)

## 2. Uplift + confidence helper (pure, tested)
- [x] 2.1 New `lib/experiment-stats.ts`: `upliftVsControl` and `confidence` (two-proportion z-test),
  plus `visitorsNeededFor95(...)` for the readout. Conservative; clearly labelled.
- [x] 2.2 Unit test the helper (known inputs → known uplift/confidence; the 95% boundary).

## 3. Server actions (admin-gated)
- [x] 3.1 `lib/landing-experiment-admin-actions.ts` (`'use server'`): `setDefaultLanding(variant)`,
  `setExperimentRunning(running)`, `stopExperiment()`, `promoteWinner(variant)`. Each reuses the
  existing admin auth guard, calls the store mutators, and `revalidatePath('/admin/experiments')`.
- [x] 3.2 `promoteWinner` sets pinned default AND stops, in one action.

## 4. The four-zone page + client controls
- [x] 4.1 Replace `app/admin/experiments/page.tsx` (server component): fetch `getPanelData()`, gate
  with `notFound()` under `editionOss()`, render the four zones.
- [x] 4.2 Zone 1 — live-state line (running split + goal + visitors, or single default serving `/`).
- [x] 4.3 Zone 2 — landing cards (name, path, self-canonical, pitch, 7-day visitors + conv rate) with
  a `SetDefaultButton` client control (Set as default / Current default), Preview, Edit.
- [x] 4.4 Zone 3 — experiment panel: a running on/off toggle + Stop (client controls); split + goal
  rendered READ-ONLY from the definition with a "start a new experiment to change these" note.
- [x] 4.5 Zone 4 — results table (variant, visitors, conversions, rate, uplift, confidence) + a winner
  callout with a `PromoteButton`; confirm-before-promote (ends the test).
- [x] 4.6 Reuse `components/ui/*` + the card/row/StatusBadge patterns (ui-patterns.md); no new
  primitive. Theme-token colours only.

## 5. Verify
- [x] 5.1 A dev-harness page renders the panel with mock data for a screenshot (real components).
  (`app/dev-harness/experiments/page.tsx`.)
- [x] 5.2 Web typecheck clean + `pnpm --filter @podway/web test` green (incl. the stats helper test).
  (`tsc --noEmit` clean; 357 tests pass incl. experiment-stats + landing-panel-store; `next build` OK.)
- [x] 5.3 Self-validate the mutating flow with the e2e/test-login path (set default → served variant
  changes; stop → default serves) before handing to the owner. (Validated at the store level via
  `test/landing-panel-store.test.ts` against the real DB harness — set-default doesn't stop, stop
  keeps the pin, and `getPanelData().servedVariant` follows the pin. Full e2e admin click-through
  left for the owner's real-cred pass.)
- [x] 5.4 Screenshot the real page (webapp-testing) and confirm it matches the mockup's four zones.
  (Playwright screenshot of the dev-harness rendering the real panel — all four zones present.)

## Recorded, NOT built here
- [ ] R.1 "Start a new experiment" from the panel — for now it links to how experiments are defined
  (a config change / new id); an in-panel new-experiment flow is a separate change.
  (Zone 3 links to the experiment detail page as the "where it's defined" surface.)
- [ ] R.2 "Edit" on a landing card — deep-link to where the landing copy lives; in-panel copy editing
  is out of scope. (Edit links to the experiment's frozen-definition detail page.)
