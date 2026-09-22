# billing Specification (delta)

## ADDED Requirements

### Requirement: Non-payment suspends only uncovered accounts

The cloud edition SHALL suspend an account's pods for non-payment ONLY when BOTH conditions hold:
the account has no working payment (no card on file, or its latest subscription invoice failed /
is past-due) AND its credit balance cannot cover the amount due (credit is zero, or less than the
open invoice total). The credit balance counts credit from every source — signup, referrals, and
admin grants. An account with a working card, or with enough credit to cover its bill, SHALL NOT be
treated as delinquent and SHALL NOT have any pod suspended. Suspension SHALL be at the level of the
delinquent account: a paid or credit-covered account's pods are never affected by another account's
delinquency.

Non-payment suspension SHALL suspend (reversibly), never delete, a pod. This behavior is cloud-only;
under the self-host edition it SHALL NOT run.

#### Scenario: A paid account is never suspended

- **WHEN** an account has a valid card and its subscription invoices are paid
- **THEN** the account SHALL NOT be marked delinquent and none of its pods SHALL be suspended

#### Scenario: Credit covers the bill

- **WHEN** an account has no working card but its credit balance is at least the amount due
- **THEN** the account SHALL NOT be marked delinquent, and if credit later drops below the amount
  due the account SHALL become eligible

#### Scenario: No working payment and credit cannot cover

- **WHEN** an account has no card (or a failed card) AND its credit is less than the amount due
- **THEN** the account SHALL be marked delinquent and enter the grace period

#### Scenario: Admin grant during grace clears delinquency

- **WHEN** a delinquent account receives enough credit (including an admin grant) to cover the bill
- **THEN** the account SHALL no longer be delinquent and any pod auto-suspended for non-payment
  SHALL be eligible to resume

#### Scenario: Self-host does not run non-payment suspension

- **WHEN** the self-host edition evaluates non-payment
- **THEN** no delinquency SHALL be recorded and no pod SHALL be suspended

### Requirement: A 7-day grace period with daily notice precedes suspension

Before suspending, the cloud edition SHALL give a delinquent account a 7-day grace period. On each
of those days it SHALL show a warning on the user's dashboard AND send the user an email asking them
to pay and warning that their pods will be suspended. Only after the account has been continuously
delinquent for the full grace period SHALL its pods be suspended. The daily email SHALL be sent at
most once per day (idempotent across a webhook and the daily sweep). If the account resolves its
delinquency at any point during grace, the clock and warnings SHALL stop.

#### Scenario: Daily warning during grace

- **WHEN** an account is delinquent on a given day within the grace period
- **THEN** a dashboard warning SHALL be shown and one reminder email SHALL be sent that day

#### Scenario: Suspension only after the full grace period

- **WHEN** an account has been delinquent for fewer than the full grace-period days
- **THEN** its pods SHALL NOT yet be suspended

#### Scenario: Resolving during grace stops the clock

- **WHEN** a delinquent account pays or gains enough credit during the grace period
- **THEN** the grace clock SHALL stop and no suspension SHALL occur
