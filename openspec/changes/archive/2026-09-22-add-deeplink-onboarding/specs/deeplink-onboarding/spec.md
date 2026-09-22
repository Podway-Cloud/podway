## ADDED Requirements

### Requirement: A deep link drops a user into a prefilled create flow for a chosen app

The platform SHALL expose a `/start?app=<slug>&ref=<source>` entry route. `app` preselects a catalog
app by slug; `ref` is an opaque attribution source. Visiting `/start`:

- SHALL validate `app` against the catalog; an unknown/absent `app` SHALL fall back to the normal
  catalog rather than error or launch anything.
- SHALL route an already-authenticated user to the create wizard PREFILLED for `app`, and an
  unauthenticated user to sign-in first (carrying the selection — see the signin-experience delta).
- SHALL NEVER create a pod on its own. A pod is created only by an explicit user action.

#### Scenario: Deep link preselects the app

- **WHEN** an authenticated user opens `/start?app=n8n&ref=hn`
- **THEN** the create wizard SHALL open with n8n already selected and a pod name pre-generated, with a
  single explicit Create the user must click

#### Scenario: Unknown app falls back safely

- **WHEN** `/start?app=does-not-exist` is opened
- **THEN** the user SHALL land on the normal catalog with no error page and no pod created

### Requirement: First-touch referral attribution is stored on the account and the pod

The platform SHALL record the deep link's `ref` as first-touch attribution: on the user's account when
the account has no `ref` yet (NEVER overwriting an existing value), and on each pod created while a
`ref` is active. Attribution SHALL be queryable from the datastore; no dashboard is required in v1.
`ref` SHALL be treated as opaque, length-capped, charset-restricted text — stored verbatim, never
rendered as trusted markup.

#### Scenario: Ref is captured first-touch on the account

- **WHEN** a brand-new user arrives via `/start?ref=partnerX` and creates their account
- **THEN** the account's `ref` SHALL be set to `partnerX`, and a later arrival via `?ref=partnerY` for
  the same account SHALL NOT overwrite it

#### Scenario: Ref is copied onto the created pod

- **WHEN** that user creates a pod while their session carries `ref=partnerX`
- **THEN** the pod SHALL record `ref=partnerX`, so the machine is later attributable to its source

### Requirement: Post-create walkthrough shows the app and how to steer it

After a deep-link create, the user SHALL see a walkthrough of exactly two cards: Card A "your <app> is
live" linking to the app's preview/open URL, and Card B "steer it from Claude" with an Open-in-Claude
action plus a one-line prompt hint for the AI admin. No more than two cards in v1.

#### Scenario: The two cards appear after create

- **WHEN** the pod finishes provisioning from a deep-link create
- **THEN** the user SHALL see Card A (open the live app) and Card B (Open-in-Claude + what to say), and
  no third card
