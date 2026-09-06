# signin-experience Specification

## Purpose
Defines the branded sign-in page: a focused, responsive surface that explains the private-alpha access context and the scope of GitHub authentication, with accessible OAuth action states including failure handling. It preserves a safe internal post-sign-in destination, rejects unsafe redirects, and offers return navigation to the landing page.
## Requirements
### Requirement: Focused branded sign-in surface
The `/signin` page SHALL present a substantial, branded authentication surface that clearly
continues the public Podway experience without reproducing the full landing page. It SHALL use a
generously sized, focused sign-in panel on larger viewports and become a full-height authentication
surface on narrow viewports.

#### Scenario: Visitor opens sign-in on desktop
- **GIVEN** the visitor is signed out on a desktop-sized viewport
- **WHEN** the visitor opens `/signin`
- **THEN** the page SHALL show Podway identity, clear private-alpha context, and a visually prominent
  authentication action without a small isolated card in an empty viewport

#### Scenario: Visitor opens sign-in on a phone
- **GIVEN** the viewport is 320px wide
- **WHEN** the visitor opens `/signin`
- **THEN** the sign-in heading, access explanation, GitHub action, and return navigation SHALL remain
  readable and reachable without horizontal overflow or competing decorative content

### Requirement: Clear private-alpha access context
The sign-in surface SHALL explain that the same GitHub action lets a returning user sign in and a
new visitor request private-alpha access. It SHALL describe the post-authentication path without
promising immediate approval.

#### Scenario: New visitor evaluates the GitHub action
- **GIVEN** the visitor does not yet have approved Podway access
- **WHEN** the visitor reads the sign-in panel
- **THEN** the page SHALL make clear that GitHub authentication submits the access request and that
  unapproved accounts continue to the existing pending state

#### Scenario: Returning user evaluates the GitHub action
- **GIVEN** the visitor already has a Podway account
- **WHEN** the visitor reads the sign-in panel
- **THEN** the same GitHub action SHALL be clearly usable to return to the requested Podway surface

### Requirement: Accessible GitHub OAuth action states
The GitHub OAuth action SHALL use a semantic button with a descriptive accessible name, visible
keyboard focus, a touch target at least 44 CSS pixels high, and distinct idle, redirecting, and
recoverable failure states. Repeated activation SHALL be prevented while redirect initiation is in
progress.

#### Scenario: Visitor starts GitHub authentication
- **GIVEN** the GitHub action is idle
- **WHEN** the visitor activates it with a pointer or keyboard
- **THEN** the action SHALL identify redirect progress, prevent duplicate activation, and start the
  existing better-auth GitHub OAuth flow

#### Scenario: OAuth initiation fails
- **GIVEN** GitHub OAuth initiation returns an error or throws before navigation
- **WHEN** the failure is received
- **THEN** the page SHALL show a readable error, restore the action to an operable state, and allow
  the visitor to retry

### Requirement: Redirects are built from the app's public origin

Any redirect the app sends a browser to SHALL be built from the app's PUBLIC origin, never from the
origin of the incoming request.

Behind a proxy the request's own origin is the internal bind address, so a redirect derived from it
sends the visitor to `https://0.0.0.0:3000/…`, which cannot load. This has shipped twice — the GitHub
OAuth callback (2026-08-31) and the preview sign-in bounce (2026-09-06, seen as "the in-cockpit
preview shows a broken page"). Both times the redirect looked correct in code and was dead in
production.

The public origin SHALL be taken from the configured canonical URL where one exists, since that is
the domain sessions and OAuth callbacks are registered under. Where none is configured — local
development and self-host — the request host MAY be used.

A bind address SHALL NOT be used to construct a redirect even as a fallback. Failing the request is
correct there: an error the caller can surface is better than sending a person to a URL that cannot
load.

#### Scenario: A signed-out visitor opens an owner-only preview

- **WHEN** the preview auth bounce redirects them to sign in
- **THEN** the destination SHALL be on the app's public origin, and SHALL NOT be the internal bind
  address

#### Scenario: No public origin can be determined

- **WHEN** no canonical URL is configured and the request carries only a bind address
- **THEN** the request SHALL fail rather than redirect to an unreachable URL

### Requirement: Destination and return navigation
The sign-in experience SHALL preserve an internal requested destination through GitHub OAuth,
default to `/dashboard` when no valid destination exists, and provide a clear route back to the
Podway landing page. External or protocol-relative destinations SHALL NOT be accepted.

#### Scenario: Internal destination survives sign-in
- **GIVEN** the visitor opens `/signin` with a valid internal `next` destination
- **WHEN** GitHub OAuth is initiated
- **THEN** that internal destination SHALL be passed as the callback destination

#### Scenario: Unsafe destination is supplied
- **GIVEN** the `next` value is external, protocol-relative, or otherwise not a safe local path
- **WHEN** the sign-in page resolves its callback destination
- **THEN** the callback destination SHALL fall back to `/dashboard`

#### Scenario: Visitor returns to the landing page
- **GIVEN** the visitor decides not to authenticate
- **WHEN** the visitor activates the return navigation
- **THEN** the visitor SHALL be taken to `/`

### Requirement: Self-host sign-in pre-fills the owner's real email

In the OSS/self-host edition the sign-in form SHALL pre-fill the owner's email. When an owner
account already exists, the pre-filled value SHALL be read from that account, NOT from a
configured or hardcoded default. A default SHALL be used only for first-run setup, before any
owner exists.

This matters because the default's domain is not stable: it moved with the podbay→podway rename.
An owner created under the old default and shown the new one would be told their password was
wrong for an address they never used.

Whether the form shows first-run SETUP or normal LOGIN SHALL remain gated on the presence of a
password credential, not on the email lookup — a missing user row must not demote a real owner to
first-run setup.

#### Scenario: An owner created under an older default signs in

- **WHEN** the sign-in page renders and an owner account exists
- **THEN** the form SHALL pre-fill that account's actual email, whatever default was in effect
  when it was created

#### Scenario: First run, before any owner exists

- **WHEN** no owner account exists yet
- **THEN** the form SHALL pre-fill the configured default (`PODWAY_AUTH_EMAIL`, else a
  valid-format placeholder), which the owner may replace with their real address

### Requirement: Clear authentication scope
Sign-in copy SHALL describe GitHub as the Podway account identity provider and SHALL NOT imply that
GitHub OAuth authenticates Claude Code, Codex, repositories, or model subscriptions.

#### Scenario: Visitor reads the identity explanation
- **GIVEN** the GitHub sign-in action is visible
- **WHEN** the visitor reads its supporting note
- **THEN** GitHub SHALL be described only as the Podway account sign-in method, separate from code
  access and Claude or Codex authentication

### Requirement: Sign-in does not depend on analytics

The sign-in control SHALL start authentication regardless of whether the analytics client is
present, initialised, or functional. Instrumentation placed BEFORE the redirect makes an
adblocker, a missing token or a browser extension indistinguishable from a broken button —
the user clicks "Continue with GitHub" and nothing happens, with no error to report.

#### Scenario: Analytics is blocked or absent

- **WHEN** the user clicks the GitHub sign-in control and the analytics client throws
- **THEN** the OAuth redirect SHALL still occur
