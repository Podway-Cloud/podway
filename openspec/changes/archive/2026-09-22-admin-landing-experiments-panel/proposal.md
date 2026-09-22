## Why

The `/admin` landing-experiments page is unusable for its actual job. It shows old cards and a status
wall, with no way to do the one thing an operator needs day to day: choose which landing serves `/`,
and read whether an A/B test has a winner. The podway GTM pod redesigned it into a focused control
panel (mockup handed to podway-dev, owner-approved) and this change builds that.

The data already exists — the landing-experiment store records per-variant visitors, conversions,
and rates, and holds runtime state (running/stopped, a pinned variant). What's missing is the
operator surface on top of it.

## What Changes

Replace the `/admin/experiments` page with a four-zone panel:

1. **Live state** — one line: what serves `/` right now (an A/B split, or a single default), the
   goal, the day/visitor count.
2. **Landings** — a card per landing variant (name, path, one-line pitch, 7-day visitors + conversion
   rate) with **Set as default** (the missing control — swaps what serves `/`), Preview, Edit.
3. **Experiment** — a running on/off toggle and **Stop**. The traffic split and goal metric are shown
   **read-only** (see the design note below), with a "start a new experiment to change these" path.
4. **Results** — a table per variant (visitors, conversions, rate, uplift vs control, confidence) and
   a winner callout with **Promote winner to default** (sets the winner as default and ends the test).

New server actions back the mutating controls (set default, toggle running, stop, promote winner);
they write only the runtime state that already exists (`landingExperimentRuns`: status + pinned
variant). SEO is preserved: traffic is split server-side (existing middleware), each landing keeps
its own self-canonical, and `/` canonicalizes to the current default.

**Deliberately NOT changing** the frozen-experiment discipline: an experiment's split (`allocation`)
and goal metric stay compile-time config. Changing them still requires a new experiment identifier —
for statistical validity and to avoid resetting the SEO entity signal (which is why the split/goal
are read-only in the panel rather than live sliders).

## Capabilities

### Modified Capabilities
- `landing-experimentation`: adds the operator control surface — set the default landing, start/stop
  the running experiment, and promote a winner — over the existing (unchanged) assignment,
  measurement, and frozen-allocation requirements.

## Impact

- `apps/web/app/admin/experiments/page.tsx` — replaced with the four-zone panel (server component +
  client controls).
- New client components for the interactive zones + a `'use server'` actions module
  (`apps/web/lib/landing-experiment-admin-actions.ts`).
- `apps/web/lib/landing-experiment-store.ts` — add a mutator to set/clear the pinned default and the
  running status (reuses `landingExperimentRuns`); read helpers for the panel's data.
- No schema change (runtime state already exists). Admin-gated; cloud-only surface (self-gate).
- Prod DB writes happen only on an operator action (set default / stop / promote) — an admin, not a
  visitor path.
