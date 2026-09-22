## ADDED Requirements

### Requirement: An environment MAY emit setup-progress markers

An environment MAY communicate first-boot progress by emitting `podway-progress: <message>` markers
from its `setup` steps or bundled scripts (e.g. a maintenance engine such as `app-admin.sh`). This is
OPTIONAL and declares the environment's OWN milestones — the platform surfaces the latest marker
generically (see the `deploy-progress` capability) and has no knowledge of any specific app. An
environment that emits no markers behaves exactly as before. Markers SHALL NOT contain secrets.

#### Scenario: An app environment declares its own milestones

- **WHEN** the n8n environment's setup emits `podway-progress: Pulling n8n…`, then
  `podway-progress: Starting the database…`, then `podway-progress: n8n is live`
- **THEN** those messages SHALL be the milestones surfaced during that pod's onboarding, with no
  n8n-specific code in the platform

#### Scenario: Emitting markers is optional

- **WHEN** an environment defines no `podway-progress:` markers
- **THEN** it SHALL resolve and run unchanged, and its onboarding SHALL show the default progress copy
