## Context

The landing-experiment system already has three layers: a **frozen config**
(`landing-experiment-config.ts` — each experiment's variants, `allocation`/split, goal metric,
`fallbackVariant`, with an explicit rule that allocation/variant changes require a NEW experiment id),
a **measurement store** (`landing-experiment-store.ts` — per-variant visitors/conversions/rates and a
`VariantExperimentReport`), and **runtime state** (`landingExperimentRuns` table: `status`
active|stopped, `pinnedVariant`, timestamps, health counters). Serving `/` is done server-side in
`apps/web/middleware.ts`. What is missing is the operator surface; today's `/admin/experiments/page.tsx`
is a status wall with no set-default or results controls.

## Goals / Non-Goals

**Goals:**
- One operator page to: see what serves `/`, set which landing is the default, start/stop the running
  experiment, and read a winner and promote it.
- Reuse the existing store + runtime state; add only the mutators the panel needs.
- Preserve SEO: server-side split, per-landing self-canonical, `/` canonical → current default.

**Non-Goals:**
- Making the split (`allocation`) or goal metric editable at runtime — they stay frozen config; a
  change is a new experiment id (statistical validity + the SEO entity signal). The panel shows them
  read-only.
- Any schema change (runtime state already exists), and any new visitor-facing behavior.
- Self-host (OSS) surface — this is a cloud admin page; it self-gates.

## Decisions

**1. "Default landing" maps to `pinnedVariant`.** Setting a default pins that variant as what `/`
serves. When the experiment is `stopped`, `/` serves `pinnedVariant ?? fallbackVariant`; when it is
`active`, the frozen `allocation` splits traffic and the pinned variant is the control/canonical
target. This reuses the existing column — no schema change — and keeps middleware the single place
that resolves the served variant.

**2. Mutating controls → a small `'use server'` actions module**
(`apps/web/lib/landing-experiment-admin-actions.ts`), each admin-gated (reuse the existing admin
guard) and each writing only `landingExperimentRuns`:
- `setDefaultLanding(variant)` — set `pinnedVariant`.
- `setExperimentRunning(running)` — set `status` active|stopped.
- `stopExperiment()` — `status=stopped` (keeps the current default).
- `promoteWinner(variant)` — `pinnedVariant=variant` + `status=stopped`, in one action.
Each `revalidatePath('/admin/experiments')` after writing.

**3. Split + goal are READ-ONLY in the panel.** They render from the active experiment definition
(`allocation`, `primaryMetric`) with a "to change the split or goal, start a new experiment" note —
NOT the live sliders the mockup drew. This is the one deliberate deviation from the mockup, and it is
the correct one: live-editing allocation would break the frozen-experiment discipline the config
enforces on purpose.

**4. Server component fetches, small client components mutate.** `page.tsx` (server) loads the
runtime, the report, and the definition, then renders: a live-state line, the landing cards, the
experiment panel, and the results table. The interactive bits (Set-as-default, on/off toggle, Stop,
Promote) are thin client components that call the server actions. Reuse existing UI primitives
(`components/ui/*`, the row/card patterns, `StatusBadge`) per `ui-patterns.md`; no new primitive.

**5. Results table reads the existing report.** Visitors/conversions/rate come straight from
`VariantExperimentReport`; uplift and confidence are computed vs the control (the pinned default) with
a standard two-proportion test — a small pure helper, unit-tested, so the "needs ~N more visitors for
95%" readout and the winner callout are real, not mocked.

## Risks / Trade-offs

- **Mockup fidelity vs backend truth.** The read-only split/goal is a visible deviation from the
  mockup. Mitigated by the "start a new experiment" affordance so the capability is still reachable,
  just not as a foot-gun slider. Flag it back to the GTM pod.
- **Prod writes from an admin click.** Set-default/stop/promote write prod runtime state. They are
  admin-gated and reversible (set a different default, restart), and touch only the runs table — never
  a visitor path. Confirm-before-write on the destructive-ish ones (promote ends a test).
- **Confidence math.** A naive significance readout can mislead. Keep the helper conservative
  (two-proportion z-test, clearly labelled), and gate the "safe to call" copy on ≥95%.
- **Edition parity.** Cloud-only; the page self-gates (`notFound()` under `editionOss()`), so OSS is
  unaffected.
