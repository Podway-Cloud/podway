## ADDED Requirements

### Requirement: Sign-in carries a deep-link app+ref selection across the OAuth round-trip

When a user reaches sign-in from a `/start?app=<slug>&ref=<source>` deep link, the sign-in flow SHALL
preserve `app` and `ref` across the GitHub OAuth redirect so the user lands back on the prefilled
create flow with attribution intact. The selection SHALL be carried by the flow's own round-tripped
state (the OAuth `state`/callback and/or a short-lived signed cookie set on `/start`), NOT by a bare
query parameter that is lost on redirect. `ref` SHALL additionally be persisted as first-touch account
attribution at login, so it survives beyond the transient carrier.

#### Scenario: A first-time visitor keeps the selection through OAuth

- **WHEN** an unauthenticated visitor opens `/start?app=n8n&ref=hn` and completes GitHub sign-in
- **THEN** after the OAuth redirect they SHALL land on the create wizard prefilled for n8n, and their
  account SHALL carry the first-touch `ref=hn`

#### Scenario: Missing app+ref is a normal sign-in

- **WHEN** a user signs in without a deep-link selection
- **THEN** sign-in SHALL behave exactly as before, with no attribution written and no forced app
