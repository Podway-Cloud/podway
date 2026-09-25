## Purpose

How Podway sends email to owners and the operator: one branded layout with a plain-text alternative,
one sender, best-effort delivery that never breaks the action that triggered it.

## ADDED Requirements

### Requirement: Every email uses the shared layout with a text alternative

Every owner- or operator-facing email SHALL be sent as `multipart/alternative` with a plain-text part
and an HTML part rendered from ONE shared layout: the Podway wordmark, a greeting by the recipient's name
(falling back to "there"), short body paragraphs, at most ONE primary button, and a footer that says why
the recipient got the email. The HTML SHALL be table-based with inline styles so it renders in major
clients (Gmail, Outlook, Apple Mail) and in dark mode.

#### Scenario: A named owner gets a reminder
- **WHEN** an email is sent to an owner whose name is "Dana"
- **THEN** both parts SHALL greet "Hi Dana", and the HTML part SHALL show the one primary button whose
  link also appears in the text part

#### Scenario: No name on file
- **WHEN** the owner has no name
- **THEN** the greeting SHALL be "Hi there"

### Requirement: Sending never breaks the triggering action

Email SHALL be sent from the configured sender (`PODWAY_FROM_EMAIL`, today `Itzhak · Podway
<hi@podway.io>`) through the Gmail API. A missing configuration SHALL be a silent no-op, and a failed send
SHALL be recorded and swallowed — never thrown into the signup, approval, billing or reminder flow.

#### Scenario: Gmail rejects the send
- **WHEN** the Gmail API returns an error
- **THEN** the failure SHALL be reported to the send-failure log and the caller SHALL continue normally
