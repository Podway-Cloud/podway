## 1. Layout + send

- [x] 1.1 Tests first: layout renders name/fallback, escapes HTML, one button, text part contains every
      HTML link; send builds multipart/alternative; missing config = no-op; failure swallowed + recorded
- [x] 1.2 `email-layout.ts` (table layout + text renderer) and one `sendEmail()` in notify.ts
- [x] 1.3 Move approval, access-request and dunning onto it; tighten their copy

## 2. Verify + ship

- [ ] 2.1 Send each email to the owner's inbox (owner yes) and check Gmail web + iOS Mail, light + dark
- [ ] 2.2 PR + merge; deploy gateway + web (owner yes)

Notes: main spec added as openspec/specs/transactional-email → archive with --skip-specs. Rendered and
checked in Chromium light + dark (2026-09-25); real Gmail/iOS check is 2.1.
