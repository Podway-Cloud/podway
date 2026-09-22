## ADDED Requirements

### Requirement: The admin panel states what serves `/` right now
The landing-experiments admin page SHALL show, as a single live-state line, whether an A/B experiment
is running (with the variant split and goal) or a single default landing is serving `/`, so an
operator sees the current state without reading a table.

#### Scenario: An experiment is running
- **WHEN** the operator opens the panel while the experiment status is `active`
- **THEN** the live-state line names the running split, the goal metric, and the visitor count

#### Scenario: No experiment is running
- **WHEN** the status is `stopped`
- **THEN** the live-state line says which single landing serves `/` and that all traffic goes to it

### Requirement: An operator can set the default landing
The panel SHALL let an operator choose which landing variant is the default served at `/`, taking
effect without a deploy. The default is recorded as the experiment run's pinned variant; the served
variant is resolved server-side from that state, so no client redirect is involved.

#### Scenario: Setting a new default
- **WHEN** the operator sets a non-default landing as the default
- **THEN** that variant is pinned, `/` resolves to it server-side, and the panel marks it as default

#### Scenario: The current default is not offered as a set target
- **WHEN** a landing is already the default
- **THEN** its control reads "current default" and is not actionable

### Requirement: An operator can start and stop the running experiment
The panel SHALL let an operator toggle the running experiment on or off and stop it, writing only the
run status. Stopping keeps the current default serving `/`.

#### Scenario: Stopping an experiment
- **WHEN** the operator stops a running experiment
- **THEN** the status becomes `stopped`, traffic stops splitting, and the current default serves `/`

### Requirement: An operator can promote a winner
When results exist, the panel SHALL offer to promote a chosen variant: in one action it becomes the
default and the experiment ends.

#### Scenario: Promoting the leader
- **WHEN** the operator promotes a variant to default
- **THEN** that variant is pinned as default AND the experiment status becomes `stopped`

### Requirement: The split and goal are read-only in the panel
The experiment's traffic split (allocation) and goal metric SHALL be shown read-only, sourced from the
frozen experiment definition, with an affordance to start a NEW experiment to change them — because a
change to allocation or goal requires a new experiment identifier for statistical validity and to
avoid resetting the SEO entity signal. The panel MUST NOT let an operator edit allocation or goal in
place.

#### Scenario: Viewing the split and goal
- **WHEN** the operator views the experiment zone
- **THEN** the current split and goal are displayed but not editable, with a path to start a new
  experiment

### Requirement: Results report uplift and confidence against the control
The results zone SHALL list each variant's visitors, conversions, and conversion rate, and for
non-control variants an uplift and a confidence versus the control (the current default), computed
from the recorded events. A winner is only called safe at 95% confidence or above.

#### Scenario: A leading variant below the confidence bar
- **WHEN** a variant leads on conversion rate but confidence is under 95%
- **THEN** the panel shows the lead and uplift but does not present it as a safe call
