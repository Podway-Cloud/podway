## Context

Launching a pod today goes: marketing site → GitHub sign-in → dashboard → catalog (`/dashboard/create`,
the Workspaces/Playbooks/Apps tabs) → pick an app → the launch wizard (`/dashboard/pods/new?env=<name>`)
→ Create. The launch wizard already takes `?env=<name>` (the catalog links to it), and sign-in is
GitHub OAuth via better-auth. The gap is a single top-of-funnel entry that (a) preselects the app,
(b) survives OAuth for a brand-new visitor, (c) captures a referral source, and (d) hands the user a
"here's your live app + how to steer it" moment right after create.

## Goals / Non-Goals

**Goals:**
- One link → live app → recordable "steer from Claude" moment, minimal decisions.
- Attribution that actually survives the OAuth redirect and is queryable later.
- Never surprise-bill: the create is always an explicit human click.

**Non-Goals:**
- Affiliate dashboard, payouts, or any ref reporting UI (just capture the value).
- Auto-create / zero-click provisioning.
- More than two walkthrough cards; a full guided tour.

## Decisions

1. **`/start?app=<slug>&ref=<source>` is a thin entry that stashes `app`+`ref` then routes to sign-in
   or the prefilled wizard.** If already authed → straight to the prefilled create wizard; if not →
   GitHub sign-in first. Rationale: one URL for outreach; the branch is invisible to the visitor.

2. **Carry `app`+`ref` through OAuth via the auth flow's own state/callback, NOT a bare query param
   that dies on redirect.** Concretely: stash them in a short-lived signed cookie (or the OAuth `state`
   the callback already round-trips) set on `/start`, read on the post-callback landing. Rationale: a
   first-time visitor's selection must survive the GitHub bounce; a cookie/state is the only thing that
   does. `ref` is also written to the account at first login (below), so it's durable beyond the cookie.

3. **First-touch attribution.** On account creation (or first authed `/start` hit), if the account has
   no `ref` yet, set it; never overwrite an existing one. Store `ref` on the ACCOUNT and, at
   `launchPod`, copy the active `ref` onto the POD. Both are new nullable columns (additive migration,
   applies to cloud + self-host). Rationale: first-touch is the honest attribution model; per-pod ref
   lets a later query tie a specific machine to a source with no dashboard.

4. **Prefilled + explicit create.** The wizard opens with the app selected and a pod name
   pre-generated (reuse the existing name generator), Create enabled — but the user clicks it. NO
   auto-submit. Rationale: a pod is a real billable machine (the proposal's hard constraint); prefilling
   removes friction without removing consent.

5. **Two-card walkthrough, gated on real capability.** After create, show Card A ("your <app> is
   live" → open preview) and Card B ("steer it from Claude" → Open-in-Claude + a one-line prompt hint).
   Card B is only honest because the AI-admin maintenance capability now exists; keep it to two cards.
   Rationale: the demo IS the product — these two cards are the recordable moment.

## Risks / Trade-offs

- **Attribution lost across OAuth** if the cookie/state isn't wired correctly — the exact failure the
  first10 spec calls out ("persist it through the OAuth round-trip"). Mitigation: decision 2 uses the
  callback's own round-tripped state + a first-touch write, not a fragile query param.
- **An unknown/dangerous `app` slug** in the link. Mitigation: validate `app` against the catalog; an
  unknown slug falls back to the normal catalog (no error page, no launch).
- **`ref` as an injection/inflation vector.** Mitigation: treat `ref` as opaque, length-capped,
  charset-restricted text stored verbatim; it is attribution data, never rendered as HTML or trusted.
- **Billing surprise.** Mitigated by decision 4 (explicit create, no auto-create) — the non-negotiable.
- **Self-host edition:** the migration applies to both editions; `/start` + attribution are cloud-growth
  concepts — gate the marketing/attribution bits behind `!editionOss()` so self-host isn't affected.
