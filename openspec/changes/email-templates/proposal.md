## Why

Every Podway email is plain text sent through the Gmail API (`packages/auth/src/notify.ts`): no layout,
no logo, no button. Three are live (access request → operator, "You're in" approval, billing dunning) and
login-expiry reminders are coming. Owners should get emails that look like a product, not a script — and
the reminders need one clear "Reconnect" button that opens the right place. Owner decision (2026-09-25):
keep Gmail (no new vendor), add templates.

## What Changes

- One shared, email-client-safe HTML layout (logo/wordmark, greeting by name, body, ONE primary button,
  footer saying why you got this) plus a plain-text alternative — every email is `multipart/alternative`.
- One `sendEmail({to, subject, heading, paragraphs, button?, footerNote})` in `packages/auth`, replacing
  the three copies of the Gmail send block. Still best-effort, env-gated, never throws.
- The three existing emails move onto it with tightened copy; they keep their names ("Hi Dana", fallback
  "Hi there").
- DNS done 2026-09-25: podway.io SPF now includes `_spf.google.com` (Gmail sends were failing SPF).

## Capabilities

### New Capabilities
- `transactional-email`: how Podway sends owner/operator email — layout, text alternative, sender,
  best-effort delivery, and which emails exist.

### Modified Capabilities

## Impact

- `packages/auth/src/notify.ts` (+ a small `email-layout.ts`), its tests.
- No new dependency, no DB change, no infra change. Web + gateway deploy (both import `@podway/auth`).
