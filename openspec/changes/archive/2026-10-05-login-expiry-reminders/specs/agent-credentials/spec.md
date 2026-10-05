## ADDED Requirements

### Requirement: Owners are reminded before an agent login expires

For a Claude subscription login with a known hard expiry, the system SHALL notify the owner at 7, 3, 2
and 1 days before expiry and at expiry: a pod system message at every threshold, and an email at 3, 2, 1
days and at expiry. A setup-token login SHALL be reminded at 14 and 3 days and at expiry. Every notice
SHALL link to the pod's reconnect wizard. A notice SHALL be sent at most once per (pod, agent, expiry,
threshold), and none SHALL be sent once the expiry has moved forward. Emails SHALL be batched to one per
owner per threshold and SHALL respect the owner's reminder-email setting.

#### Scenario: Three days out
- **WHEN** a pod's Claude login expires in 3 days and the owner has not reconnected
- **THEN** the owner SHALL get one email listing that pod with a Reconnect button, and the pod SHALL
  receive one system message with the same link

#### Scenario: The owner reconnects
- **WHEN** the login's expiry moves forward after the 3-day notice
- **THEN** no 2-day, 1-day or expiry notice SHALL be sent for the old expiry

#### Scenario: A restart does not resend
- **WHEN** the gateway restarts after sending the 3-day notice
- **THEN** the 3-day notice SHALL NOT be sent again

#### Scenario: Unexpected sign-out
- **WHEN** a login reads `needs-login` with reason `rejected` or `expired` before its date
- **THEN** the "expired" notice SHALL be sent at once

#### Scenario: Reminder emails turned off
- **WHEN** the owner turned reminder emails off
- **THEN** no reminder email SHALL be sent, and the dashboard and pod message SHALL continue
