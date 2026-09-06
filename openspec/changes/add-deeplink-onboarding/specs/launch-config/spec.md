## ADDED Requirements

### Requirement: The create wizard can open prefilled from a deep link, with an explicit create

The pod-create wizard SHALL support being opened PREFILLED from a deep link: the target app already
selected and a pod name pre-generated, so the user's only remaining action is to confirm. The wizard
SHALL require a single explicit "Create" action and SHALL NOT auto-submit or otherwise create a pod
without that action, because a pod is a real, billable machine.

#### Scenario: Prefilled wizard still requires an explicit create

- **WHEN** the wizard opens prefilled from `/start?app=n8n` with a generated pod name
- **THEN** no pod SHALL be created until the user clicks Create; the app + name are editable before then

#### Scenario: No auto-create from a deep link

- **WHEN** a user follows a deep link and does not click Create (closes the tab, navigates away)
- **THEN** no pod SHALL have been provisioned and the user SHALL NOT be billed for one
