# Non-payment safety net

## Why

The cloud edition charges a saved card once free credit runs out, but there is **no consequence**
for non-payment: `invoice.payment_failed` is a no-op, and nothing suspends a pod for a delinquent
account. Free compute leaks indefinitely to accounts with no working payment. The only guardrail —
the RAM budget — blocks *creating* pods, never stops running ones.

## What changes

Add a dunning + auto-suspend safety net, owner-approved 2026-09-14, with one hard constraint:
**only an account with no working payment AND no credit to cover its bill is suspended — never a
paid or credit-covered account.**

- **Detect delinquency:** an account is delinquent when (no card on file OR its card payment failed)
  AND (credit is zero OR cannot cover the amount due). Credit counts from signup, invites/referrals,
  AND admin grants.
- **7-day grace with daily nudges:** on entering delinquency, start a 7-day clock; each day show a
  dashboard warning and send an email asking the user to pay and warning of suspension.
- **Suspend after grace:** after 7 delinquent days, suspend that account's pods (suspend, not
  delete — reversible). Paying or gaining enough credit clears the state and allows resume.
- **Cloud-only:** the whole flow is gated off under the self-host edition (no Stripe there).

## Impact

- Affected specs: `billing` (new dunning/suspend behavior).
- Affected code: `packages/db` (a delinquency record), `packages/control-plane` (detect on
  `invoice.payment_failed` + a daily sweep, the eligibility rule, the suspend action),
  `apps/web` (dashboard warning banner), the mailer (daily reminder).
- Edition parity: same schema serves OSS; the flow no-ops when `editionOss()`.
