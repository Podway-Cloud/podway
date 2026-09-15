# Tasks — non-payment safety net

## 1. Schema (packages/db)
- [x] 1.1 `billing_delinquencies` table + migration `0062_billing_delinquencies.sql` (verified applies via createTestDb).
- [x] 1.2 `pods.nonpayment_suspended_at` marker (distinguishes auto-suspend from manual); threaded through drizzle-store + PodRecord.

## 2. Eligibility rule (packages/control-plane)
- [x] 2.1 `DunningService.amountDueCents(pods)` — monthly pod cost via `priceForSize`.
- [x] 2.2 `evaluateOwner` — (no card OR open invoice) AND (credit < amountDue); `billing.hasOpenInvoice`.
- [x] 2.3 Unit tests for the rule (12 tests, real DB + fakes) — card ok / credit covers / partial / failed card / admin-grant clears.

## 3. Detection
- [x] 3.1 `invoice.payment_failed` in `BillingService.handleEvent` → `onPaymentFailed` hook → `DunningService.evaluate` (wired in the web webhook route).
- [x] 3.2 Daily sweep (`DunningService.sweep`) in the gateway, cloud-only (gated on `stripeConfigured()`).
- [x] 3.3 Idempotent daily email (guard on `lastNotifiedDay`).

## 4. Suspend / resume
- [x] 4.1 `PodService.suspendForNonpayment(id)` — reversible, marks the pod, emits `suspended{reason:nonpayment}`.
- [x] 4.2 `resumeFromNonpayment(id)` — only wakes marked pods; never touches a manual suspend.

## 5. Dashboard warning (apps/web)
- [x] 5.1 `DelinquencyBanner` in the dashboard layout (warning/destructive tones, days-left, Fix-billing link).

## 6. Email
- [x] 6.1 `sendDunningEmail` in `@podway/auth/notify.ts` (grace reminder + suspension notice).

## 7. Edition parity
- [x] 7.1 Sweep gated on `stripeConfigured()` (off under OSS/self-host); banner gated on `billingOff()`; both no-op there.

## 8. Tests + verification
- [x] 8.1 e2e (`apps/web/e2e/nonpayment-safety-net.spec.ts`): no banner → sweep opens a grace row +
  dashboard warns → cross the 7-day grace → pod suspended + suspended banner → grant credit → resolve
  + resume + banner clears. Driven via a test-login-gated `/api/e2e/dunning` seam (owner-scoped
  `advance` + injectable clock) and a dedicated `billing` user; the banner gate was relaxed to key off
  the row's existence (a row only exists when the Stripe-gated sweep created it).
- [x] 8.2 Unit + typecheck green across db/control-plane/auth/gateway/web; spec updated in the same change.
