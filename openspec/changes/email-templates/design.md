## Context

`notify.ts` repeats the same Gmail send block three times (approval, access request, dunning), each
building a text/plain RFC822 message. Gmail API via a Workspace service account with domain-wide
delegation; sender `Itzhak · Podway <hi@podway.io>`. DKIM (google._domainkey) is published; SPF was
missing Google (fixed 2026-09-25); DMARC `p=none`.

## Goals / Non-Goals

**Goals:** one layout + one send function; HTML + text; name greeting; one button; migrate the 3 emails.

**Non-Goals:** a new email vendor (owner kept Gmail), marketing/newsletters (Listmonk later),
open/click tracking, per-user email preferences (only the reminder emails get an opt-out, in
login-expiry-reminders).

## Decisions

- **Hand-written table layout, no dependency** over React Email: ~80 lines of HTML with inline styles,
  modeled on the widely used open transactional templates (single column, 600px, bulletproof button).
  React Email would add react + components to the gateway bundle for four emails. Revisit if emails grow
  past ~10 kinds.
- **Escape every interpolated value** (names, pod names) in the HTML part.
- **Plain-text part is primary copy**, the HTML is its rendering — so the two can never say different
  things; tests assert every link in the HTML also appears in the text.
- **Copy**: short, specific, active voice; subject says the action ("Reconnect Claude on makore.app
  prod"); one button; the footer states why ("You're getting this because you own this pod").

## Risks / Trade-offs

- Gmail Workspace sending cap (~2,000/day) → far above current volume; the reminder sweep batches one
  email per owner. Revisit (Resend/Postmark) if volume grows.
- HTML rendering drift across clients → keep the layout minimal; manual check in Gmail web + iOS Mail
  before shipping.
