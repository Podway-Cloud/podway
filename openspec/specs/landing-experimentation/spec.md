# landing-experimentation Specification

## Purpose
Defines how Podway runs a measured landing-positioning experiment: assigning each eligible visitor to exactly one semantic variant before render (no redirect, no client swap), excluding previews and crawlers from measurement, and durably recording a privacy-minimal acquisition funnel from exposure through sign-in, pod creation, agent connection, and first project open. It also defines the server-controlled experiment definition, the admin overview/detail surfaces that report per-variant counts and rates, and the guarded, audited Stop/Pin controls used to end or roll back a run.
## Requirements
### Requirement: Stable landing experiment assignment
The system SHALL assign each eligible visitor to exactly one arm of the ACTIVE landing experiment and
SHALL persist that assignment across visits in an experiment-specific cookie. Assignment SHALL occur
before rendering, SHALL NOT redirect the visitor, and SHALL NOT produce a client-render content swap.
Prior experiments' assignment data and cookies SHALL remain historically distinct.

In a `validation` delivery mode the system SHALL RENDER the experiment's `validationVariant` to EVERY
eligible visitor regardless of their assigned arm — the split validates the pipeline without a
content difference (an A/A); only a `measured` mode renders the assigned arm. The active experiment
(2026-10, owner decision) is `landing-computer-vs-selfhost-2026-10`: a MEASURED 50/50 A/B whose arms are
`agent-computer` and `selfhost` — each visitor SEES their assigned arm, and the `selfhost` arm renders the
self-hosted AI admin landing at `/`. Crawlers get `agent-computer`. The previous real-home/cloud A/A
(`landing-agent-computer-2026-08-real-home-cloud`, whose second arm `outcomes` was never rendered) and the
earlier `landing-agent-computer-2026-08-taxonomy` and `landing-agent-computer-2026-08` definitions SHALL
remain registered as historical so their assignments and events stay queryable. A visitor in the
`selfhost` arm SHALL keep their assignment through `/selfhost/signin` (it clears the assignment only for
visitors of other arms, so a standalone `/selfhost` visit is never credited to a homepage arm).

#### Scenario: New eligible visitor opens the landing page
- **GIVEN** a signed-out human visitor has no assignment for the active experiment
- **WHEN** the visitor requests `/`
- **THEN** the system SHALL assign one of the active experiment's arms using the configured allocation,
  persist that assignment, and — in measured mode — render the assigned arm (`agent-computer` or the
  `selfhost` landing); in validation mode it would render the `validationVariant` regardless of arm

#### Scenario: Assigned visitor returns
- **GIVEN** a visitor has a valid active real-home/cloud assignment
- **WHEN** the visitor requests `/` again
- **THEN** the system SHALL retain the same semantic assignment without reassigning the visitor

#### Scenario: Visitor from a preceding experiment enters the active experiment
- **GIVEN** a visitor has a valid assignment for a historical experiment but no active assignment
- **WHEN** the visitor requests `/` after the real-home/cloud experiment begins
- **THEN** the system SHALL create an independent active assignment and SHALL NOT rewrite or reuse
  the historical variant as active experiment data

#### Scenario: Assignment format is invalid
- **GIVEN** a visitor presents a missing, expired, or unrecognized assignment
- **WHEN** the visitor requests `/`
- **THEN** the system SHALL create a valid current assignment without failing the landing request

### Requirement: Experiment eligibility and isolation
The system SHALL exclude forced-preview requests and recognized automated crawlers from experiment
measurement. Authenticated visitors MAY receive a landing variant, but their visits SHALL be
distinguishable from acquisition traffic and excluded from the primary signed-out analysis.

#### Scenario: Automated crawler requests the canonical landing
- **GIVEN** the request is recognized as an automated crawler
- **WHEN** it requests `/`
- **THEN** the system SHALL render the configured canonical variant without creating a measured
  experiment participant

#### Scenario: Authenticated user opens the landing
- **GIVEN** the visitor is already authenticated
- **WHEN** the visitor requests `/`
- **THEN** the rendered CTA SHALL lead to the dashboard and any exposure SHALL be marked ineligible
  for primary acquisition analysis

### Requirement: Semantic forced-preview routes
The system SHALL expose `/preview/landing/outcomes`, `/preview/landing/agent-computer`, and
`/preview/landing/agent-home` as deterministic review surfaces. Preview requests SHALL NOT create
or mutate assignment cookies and SHALL NOT emit experiment exposure or interaction events.
`agent-home` SHALL NOT become an assignable variant of `landing-positioning-2026-07` merely by
being available as a preview.

#### Scenario: Reviewer opens a forced preview
- **GIVEN** a reviewer requests one of the semantic preview routes
- **WHEN** the route renders
- **THEN** the requested landing composition SHALL render regardless of any existing experiment
  assignment without changing that assignment

#### Scenario: Reviewer interacts with the agent-home preview
- **GIVEN** a reviewer has a valid assignment cookie from the canonical landing experiment
- **WHEN** they activate a link on `/preview/landing/agent-home`
- **THEN** the requested navigation SHALL occur without recording a landing experiment event

#### Scenario: Search crawler sees a preview route
- **GIVEN** a crawler requests a forced-preview route
- **WHEN** metadata is returned
- **THEN** the route SHALL be marked `noindex` and SHALL declare `/` as its canonical URL

#### Scenario: Canonical visitor is assigned during the current experiment
- **GIVEN** `landing-positioning-2026-07` remains active
- **WHEN** an eligible visitor requests `/`
- **THEN** the system SHALL assign only `outcomes` or `agent-computer` and SHALL NOT assign
  `agent-home`

### Requirement: Durable experiment event recording
The system SHALL provide a same-origin ingestion path that durably records eligible experiment
events with experiment identifier, variant, opaque anonymous visitor identifier, event name, event
time, and available campaign attribution. Event delivery failures SHALL NOT block navigation,
authentication, or product actions.

#### Scenario: Assigned landing finishes loading
- **GIVEN** an eligible assigned visitor receives a landing variant
- **WHEN** the page becomes viewable
- **THEN** the client SHALL submit one deduplicated `landing_exposure` event for that visitor and
  experiment assignment

#### Scenario: Visitor activates the primary CTA
- **GIVEN** an eligible assigned visitor is viewing the landing
- **WHEN** the visitor activates the primary CTA
- **THEN** the system SHALL attempt to record `landing_primary_cta` with the current experiment and
  variant before or concurrently with navigation

#### Scenario: Event ingestion is unavailable
- **GIVEN** the experiment event endpoint fails or cannot be reached
- **WHEN** an instrumented interaction occurs
- **THEN** the requested user action SHALL still complete normally

### Requirement: Anonymous-to-user attribution
The system SHALL preserve an eligible visitor's active experiment attribution through
authentication and SHALL associate subsequent activation events with both the original assignment
and authenticated user without changing the variant. Historical experiments SHALL remain
queryable, but new downstream product events SHALL attach to the current active experiment only.

#### Scenario: Assigned visitor completes sign-in
- **GIVEN** an eligible August visitor starts authentication from the landing page
- **WHEN** authentication completes successfully
- **THEN** the system SHALL record `signin_completed` for the original August assignment and
  associate the anonymous visitor identifier with the authenticated user

#### Scenario: Attributed user activates a pod
- **GIVEN** an authenticated user has active August landing attribution
- **WHEN** the user creates a pod, connects its agent, or first opens its project
- **THEN** the system SHALL record the corresponding event against the August attribution without
  adding the event to the historical July run

### Requirement: Privacy-minimal experiment data
Landing experiment attribution SHALL use opaque identifiers, SHALL NOT require raw IP storage, and
SHALL accept only allowlisted experiment identifiers, variants, and event names.

#### Scenario: Event contains unrecognized values
- **GIVEN** a client submits an unknown experiment, variant, or event name
- **WHEN** the ingestion endpoint validates the payload
- **THEN** the system SHALL reject or ignore the event without persisting arbitrary client data

#### Scenario: Event is accepted
- **GIVEN** a valid event is submitted
- **WHEN** it is persisted
- **THEN** the stored record SHALL omit raw IP address and arbitrary free-form metadata

### Requirement: Experiment operational controls
Each landing experiment SHALL define its immutable identifier, semantic variant subset, allocation,
delivery mode, validation variant, canonical crawler variant, analysis window, and metric
definitions in a server-controlled registry. Exactly one definition SHALL be active for new public
assignment and event attribution. Runtime state SHALL hold the active experiment's live traffic split
(variant → percent) and a "one landing for everyone" mode, set only through the homepage traffic
control below. The coded allocation is the default split when none is saved. Historical definitions
and data SHALL remain read-only.

#### Scenario: August experiment runs validation mode
- **GIVEN** the active definition uses A/A/A validation mode
- **WHEN** new visitors request `/`
- **THEN** middleware SHALL assign approximately 34/33/33 across the three semantic variants while
  root rendering serves the configured validation variant for every assignment

#### Scenario: August experiment runs measured mode
- **GIVEN** the active definition uses measured delivery mode
- **WHEN** an assigned visitor requests `/`
- **THEN** root rendering SHALL serve that visitor's assigned semantic variant

#### Scenario: One landing for everyone
- **GIVEN** an administrator set the homepage to one landing
- **WHEN** a visitor requests `/`
- **THEN** that landing SHALL render for every visitor, a new visitor SHALL get no variant cookie
  (so a later split assigns them fairly), and existing measurements SHALL remain available

#### Scenario: Variant changes materially
- **GIVEN** headline, narrative, offer, proof, or variant set changes after August
  measurement begins
- **WHEN** operators publish that change as a new test
- **THEN** the system SHALL use another experiment identifier so observations are not combined

### Requirement: One homepage traffic control
`/admin/experiments` (admin-only, cloud-only) SHALL be ONE page that states what `/` serves now and
offers ONE control with two modes (owner redesign, 2026-10-07; it replaced Set default / Turn on-off /
Stop / Pin / Promote and the per-experiment detail page):
- **Split test**: a percent per landing (slider + presets), saved to the run's `weights`.
- **One landing only**: every visitor sees the chosen landing (`status` stopped + `pinned_variant`).
Nothing changes until Save; a confirm states the before → after and what happens to visitors and
results. The middleware (Node runtime) reads the live split, cached ≤15s, and falls back to the coded
allocation if the database cannot be read. Visitors are sticky: a returning visitor keeps their
landing in split mode; only new visitors follow a new split.

#### Scenario: Changing the split
- **WHEN** an admin saves a 30/70 split
- **THEN** new visitors are assigned 30/70, returning visitors keep their landing, and a new results
  period starts

#### Scenario: Switching to one landing and back
- **WHEN** an admin saves "One landing only: Self-host", then later saves a split again
- **THEN** every visitor sees Self-host meanwhile; the split's weights are kept, and saving the split
  again resumes it with a new results period

#### Scenario: Non-administrator
- **GIVEN** a signed-out or non-admin visitor
- **WHEN** they request the page or call its action
- **THEN** access SHALL be denied before any write

### Requirement: Guarded and audited admin controls
Every homepage traffic change SHALL validate against the active definition (only its variants; whole
percents summing to 100) and SHALL update the run and insert one `traffic` audit row (administrator,
prior and resulting status, pin and weights, timestamp) in ONE statement; an unchanged save is a no-op.
The page SHALL show these rows as a plain-words change log, newest first.

When an anonymous visitor starts sign-in from the self-host landing, the site SHALL clear
active-acquisition attribution cookies before the sign-in flow so a self-host conversion cannot appear
without an acquisition exposure.

#### Scenario: Invalid split
- **WHEN** an admin submits weights that use another experiment's landing or do not sum to 100
- **THEN** the change SHALL be rejected without changing runtime state or writing an audit row

#### Scenario: Self-host visitor starts sign-in
- **GIVEN** an anonymous visitor is viewing the self-host landing at `/selfhost` or promoted at `/`
- **WHEN** they choose a Podway access action
- **THEN** active-acquisition visitor and variant cookies SHALL be cleared before `/signin` loads, so
  later sign-in and activation events are not attributed to the acquisition experiment


### Requirement: Results per period, with a plain verdict
Each saved split SHALL start a new results period. A period's cohort SHALL be the visitors whose FIRST
homepage exposure fell in it, and only their sign-ins (the primary metric) and pod creations count —
so numbers from different splits never mix and a returning visitor never moves between periods. The
page SHALL show the current period's visitors, sign-ups, conversion and pods per landing, the uplift
of the second landing versus the first (the control), and one plain verdict: "Too early", "Not decided
yet" (with confidence and roughly how many more visitors reach 95%), or a winner at ≥95% confidence.
Earlier periods SHALL stay available, collapsed.

#### Scenario: A sign-up after the split changed
- **GIVEN** a visitor first saw the homepage in period 1
- **WHEN** they sign in during period 2
- **THEN** the sign-up SHALL count in period 1, not period 2

#### Scenario: A leading landing below the confidence bar
- **WHEN** a landing leads on conversion but confidence is under 95%
- **THEN** the verdict SHALL say "Not decided yet" and SHALL NOT present it as a winner
