## 1. Data model — attribution columns

- [x] 1.1 Add nullable `ref` (attribution source) to the account table and to the pods table in `packages/db` — additive, backward-compatible migration (applies to cloud AND self-host per edition-parity).
- [x] 1.2 Length-cap + charset-restrict `ref` on write (opaque text, stored verbatim; never rendered as trusted markup).

## 2. The /start entry route + OAuth carry-through

- [x] 2.1 Add the `/start` route in `apps/web`: parse `app` (validate against the catalog; unknown → fall back to the normal catalog, no error/launch) and `ref`.
- [x] 2.2 Authed user → route to the prefilled create wizard for `app`. Unauthed → sign-in, carrying `app`+`ref` via the OAuth `state`/callback and/or a short-lived signed cookie set on `/start` (NOT a bare query param).
- [x] 2.3 On first authed arrival / account creation, write first-touch `ref` to the account (never overwrite an existing value). Gate the marketing/attribution bits behind `!editionOss()`.

## 3. Prefilled + explicit create

- [x] 3.1 Open the create wizard prefilled: app selected, pod name pre-generated (reuse the existing name generator), Create enabled but NOT auto-submitted.
- [x] 3.2 On `launchPod`, copy the session's active `ref` onto the created pod (`packages/control-plane` / `apps/web/lib/actions.ts`).

## 4. The 2-card walkthrough

- [x] 4.1 After a deep-link create, show exactly two cards: Card A "your <app> is live" (open the preview/app URL); Card B "steer it from Claude" (Open-in-Claude + a one-line prompt hint). No third card.
- [x] 4.2 Reuse existing card/walkthrough primitives; keep it edition-aware.

## 5. Verify + spec

- [x] 5.1 e2e/screenshot: `/start?app=n8n&ref=x` → (signed-in) prefilled wizard → explicit Create → the two cards; unknown app → catalog fallback; `ref` present on the account + the created pod (DB check).
- [ ] 5.2 `openspec validate add-deeplink-onboarding --type change` green; archive after launch-verify.
