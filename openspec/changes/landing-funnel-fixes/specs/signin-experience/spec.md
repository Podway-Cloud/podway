## ADDED Requirements

### Requirement: A visitor sees the create wizard before signing in

A visitor arriving from a landing or app link SHALL see the create wizard for that app (size, name, the
"free" label) without an account. Sign-in SHALL be asked when they click "Create my free pod", and their
choices SHALL survive the OAuth round trip. No pod SHALL be created before sign-in.

#### Scenario: An HN visitor picks Vaultwarden

- **WHEN** an anonymous visitor clicks the Vaultwarden card
- **THEN** they see the Vaultwarden wizard, and only "Create my free pod" asks them to sign in
