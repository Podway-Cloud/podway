# access-control Specification (delta)

## ADDED Requirements

### Requirement: Access gates are enforced and tested at runtime, not by source inspection

Every server action or route that mutates state or exposes admin/owner data SHALL enforce its access
gate at runtime (a non-admin, unapproved, or cross-owner caller is refused), and this enforcement
SHALL be verified by a test that INVOKES the action with an unauthorized principal and asserts it
refuses — NOT by a test that reads the source and asserts it contains a gate call. A source-text
assertion passes when a gate is present-but-dead, renamed-but-working, or absent from a newly-added
action, so it does not establish the security property it appears to.

The test suite SHALL also fail when a new state-mutating server action ships without an access gate,
so that gate coverage cannot silently regress as actions are added.

#### Scenario: An unauthorized caller is refused at runtime

- **WHEN** a guarded server action or admin route is invoked by an unapproved, non-admin, or
  cross-owner principal
- **THEN** it SHALL refuse (throw or redirect) and make no state change, and a test SHALL assert this
  by invoking it, not by inspecting its source

#### Scenario: A newly-added ungated action fails the suite

- **WHEN** a state-mutating server action is added without an access gate
- **THEN** the test suite SHALL fail, identifying the ungated action

### Requirement: A merge-gating check reflects the tests it claims to run

A check that gates a merge SHALL fail the merge when the tests it represents are red, and SHALL NOT
report success when those tests did not run. An end-to-end suite whose result is treated as a
merge signal SHALL either gate the merge directly or be represented by a status check that fails on a
red run; it SHALL NOT be advisory-only while being relied upon as validation.

#### Scenario: A red end-to-end run does not merge green

- **WHEN** the end-to-end suite is red on a pull request
- **THEN** the pull request SHALL NOT report an all-green merge signal
