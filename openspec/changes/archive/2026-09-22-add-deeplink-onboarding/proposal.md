## Why

Growth (affiliate links, warm outreach, a Show-HN clip) needs a friction-minimal path from a link to a
LIVE app the prospect can see and steer — and a clean, recordable demo of exactly that. Today a new
user lands on the marketing site, signs in, then has to find the app in the catalog and configure a
pod. A deep link that preselects the app, prefills the launch wizard, and captures the referral source
turns "click a link → your n8n is live, steer it from Claude" into the first thing a prospect
experiences. The one dependency — an AI admin worth pointing Card B at — now exists (the n8n
maintenance engine shipped 2026-09-01), so the promise isn't hollow.

## What Changes

- A **`/start?app=<slug>&ref=<source>`** entry route: `app` preselects a catalog app; `ref` is the
  attribution source.
- **`ref` (and `app`) survive the GitHub OAuth round-trip** — a first-time visitor signs in and the
  selection + attribution are not lost across the redirect.
- The pod-create wizard opens **PREFILLED**: the app is already selected and a pod name is
  pre-generated, so the user's only decision is to confirm.
- **Exactly one explicit "Create"** — NO silent auto-create. A pod is a real, billable machine; the
  user always makes the create decision.
- A post-create **2-card walkthrough**: Card A "your <app> is live" (open the app / preview URL) and
  Card B "steer it from Claude" (Open-in-Claude + one line on what to tell the AI admin).
- **First-touch attribution**: `ref` is stored on the ACCOUNT (never overwritten once set) AND on the
  created pod, queryable later via the DB.

## Capabilities

### New Capabilities
- `deeplink-onboarding`: the `/start` entry flow — app+ref parsing, prefilled-and-explicit create, the
  2-card walkthrough, and first-touch ref attribution on the account + pod.

### Modified Capabilities
- `signin-experience`: the sign-in flow SHALL carry an `app`+`ref` selection across the GitHub OAuth
  round-trip so a first-time visitor lands back on the prefilled create flow with attribution intact.
- `launch-config`: the create wizard SHALL support being opened prefilled (app + generated name) from a
  deep link, with a single explicit Create and no auto-create.

## Impact

- `apps/web` — the `/start` route, the OAuth state/round-trip carrying `app`+`ref`, the prefilled
  wizard, the 2-card post-create walkthrough.
- `packages/db` — nullable `ref`/attribution column(s) on the account and pod tables (additive,
  backward-compatible migration).
- `packages/auth` / `packages/control-plane` — persist first-touch `ref` on account create and on
  `launchPod` (write the pod's ref).
- Non-goals (v1): affiliate dashboard/payouts, any auto-create, more than two walkthrough cards.
