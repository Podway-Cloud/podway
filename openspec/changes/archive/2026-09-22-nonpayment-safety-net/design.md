# Design — non-payment safety net

## The eligibility rule (the "only unpaid pods" guarantee)

An account is **delinquent** iff BOTH:

1. **No working payment** — `hasCard=false` OR its latest subscription invoice is `past_due`/failed.
2. **Credit can't cover it** — `creditCents < amountDueCents` (0 credit ⇒ trivially true).

`amountDueCents` = the account's open/next subscription invoice total. If either half is false the
account is NOT delinquent, and none of its pods are ever in scope. This is account-level: the pods
suspended are exactly the delinquent account's pods, so a paid or credit-covered account is untouched.

Credit is the single mirrored balance (`billing_accounts.creditCents`, Stripe customer balance is
source of truth); it already aggregates signup + referral + admin grants, so no source-specific
logic is needed — check the one balance.

## Detection: webhook + daily sweep (both, deliberately)

- **`invoice.payment_failed` webhook** → mark delinquent immediately (start the clock) if the rule
  holds. Add the case to `BillingService.handleEvent` (today it's unhandled).
- **Daily sweep** (a scheduled control-plane job) → the grace clock needs a daily tick to send the
  daily email and to fire suspension on day 7; it also catches accounts a webhook missed and
  re-checks whether credit now covers the bill (admin grant / referral arriving mid-grace clears it).

## State: a delinquency record

New backward-compatible addition (edition-parity: same schema serves OSS, nullable/additive):
a `billing_delinquencies` row per owner — `ownerId`, `since` (clock start), `lastNotifiedDay`
(0-7, idempotent daily email), `suspendedAt` (null until suspend fires). Cleared (row deleted or
`resolvedAt` set) when the account becomes non-delinquent. Keeping the clock in a row (not derived
each run) makes the daily email idempotent and survives restarts.

## Suspend / resume

- Suspend via the existing provider suspend path used by the cockpit — reversible, not delete.
- On clearing delinquency, a previously auto-suspended pod is eligible to resume. Distinguish
  auto-suspend from an owner's manual suspend so we only auto-resume what we auto-suspended
  (a `suspendedBy: "nonpayment"` marker on the pod or the delinquency row).

## Cloud vs OSS

Self-host has no Stripe → `stripeConfigured()` is false and `editionOss()` is true. The webhook
case, the sweep, the banner, and the email all no-op / are absent under OSS. Verify the sweep is a
no-op there (it must not suspend self-host pods).

## Testing

- **Unit** (the rule): card ok ⇒ not delinquent; no card + credit covers ⇒ not delinquent; no card +
  partial credit ⇒ delinquent; failed card + zero credit ⇒ delinquent; admin-granted credit that
  now covers ⇒ clears. Day counter: emails once per day, suspends on day 7 not before.
- **e2e**: simulate a failed payment (test hook) → dashboard banner appears → advance the clock →
  pods suspend; then add credit → banner clears → pods resume.

## "Amount due" — the bill credit is compared against (DECIDED 2026-09-14)

`amountDueCents(ownerId)` = the **monthly cost of the account's active pods** = sum over active pods
of `priceForSize(pod.size) * 100` (`packages/shared/src/tiers.ts` — mini $4 … xl $42). This is what
the account owes per month and works for BOTH branches of velsa's rule:

- **No card:** there is no Stripe subscription/invoice to read, so the imputed monthly pod cost IS
  the bill. Delinquent when credit can't cover it.
- **Card that failed:** a failed/open Stripe invoice exists; its amount equals the pod cost. Same number.

So `isDelinquent(ownerId)` = **(hasCard is false OR an open/past-due Stripe invoice exists) AND
(creditCents < amountDueCents)**. A carded account in good standing (no open invoice) is never
delinquent regardless of credit. This interpretation is stated in the PR for the owner to veto.

## Remaining minor choices (decide while building)
- Email copy + banner copy for the 7 days.
- Day-0 (the failure day) counts as day 1 of 7.
