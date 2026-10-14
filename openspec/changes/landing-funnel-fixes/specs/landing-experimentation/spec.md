## ADDED Requirements

### Requirement: The wizard-before-sign-in step is measured

The funnel SHALL record when an anonymous visitor sees the create wizard (`wizard_viewed`, with the app
and variant) in `landing_experiment_events`, so the change can be judged against CTA clicks and pods
created.

#### Scenario: An anonymous visitor opens a wizard

- **WHEN** an anonymous visitor reaches the create wizard from a landing
- **THEN** one `wizard_viewed` event with the app and variant SHALL be stored
