## Why

Show HN day (2026-10-13), PostHog: 19 visitors came from news.ycombinator.com and 0 signed up.
- 18 of 19 only saw the home page. 6 left without scrolling; half saw less than 20% of it. Most stayed 6–40 s.
- The ONE visitor who clicked toward a pod (the Vaultwarden card) reached `/signin` and clicked back to `/`.
- Our own experiment table (`landing_experiment_events`) measures the funnel fine — 2026-10-13: 54
  landing exposures → 3 CTA clicks (≈6%) → 1 pod created. (PostHog does not get these events; it does
  not need to.)
- 60 days: 7 sign-ups, 1 with Claude signed in.

## What Changes

1. (Dropped: measurement already works in `landing_experiment_events`.)
2. **Above the fold**: the first screen must say what it is, for whom, and the price, with one primary
   button — measured by scroll depth and CTA rate, not by taste.
3. **Sign-in is no longer the first wall**: show the app's create wizard (size, name, price "free") BEFORE
   sign-in, and ask for sign-in on "Create my free pod". The choice is kept through OAuth (it already is
   for `/start?app=`).

## Decisions

- (3) Anonymous visitors MAY see the wizard; sign-in only on "Create my free pod" (owner, 2026-10-13).
- Open: (2) what the first screen leads with — I bring 2 drafts after (1) has a few days of data.

## Impact

`apps/web` landing + `/start` + `/signin`. No schema change. Judge (2) and (3) by the
`landing_experiment_events` funnel.
