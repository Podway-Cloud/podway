## ADDED Requirements

### Requirement: A visitor sees the create wizard before signing in

A visitor arriving from a landing or app link SHALL see the create wizard for that app (size, name, the
"free" label) without an account. Sign-in SHALL be asked when they click "Create my free pod", and their
choices SHALL survive the OAuth round trip. No pod SHALL be created before sign-in.

#### Scenario: An HN visitor picks Vaultwarden

- **WHEN** an anonymous visitor clicks the Vaultwarden card
- **THEN** they see the Vaultwarden wizard, and only "Create my free pod" asks them to sign in

### Requirement: The catalog link shows the catalog before sign-in

On cloud, a signed-out visitor opening `/start?tab=apps` (the landing's main button) SHALL see the app
catalog without an account. Each app card SHALL open `/start?app=<app>` with the same `ref`, i.e. the
signed-out wizard. Self-host keeps sign-in first.

#### Scenario: A visitor clicks "Start free"

- **WHEN** a signed-out visitor clicks the landing's "Start free"
- **THEN** they see the app catalog, and clicking an app opens that app's wizard, still signed out
