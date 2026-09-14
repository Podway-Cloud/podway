## Purpose

Defines how Podway deploys and maintains a self-host OSS app inside a pod, so a new app can be added
as a thin config rather than a reimplementation: the app-env contract, the shared maintenance engine,
the persistence guarantee, the cloud-only constraint, and the smoke-test bar for entering the catalog.

## ADDED Requirements

### Requirement: An app env deploys and self-maintains through a shared engine

An `kind: app` environment SHALL deploy and maintain its service through a SHARED maintenance engine
driven by a small per-app manifest (health URL, container + volume names, DB dump command, key-guard
on/off, image pin), NOT a per-app reimplementation of that logic.

#### Scenario: First deploy brings the stack up healthy
- **WHEN** an app env's first-run setup runs the engine's `deploy`
- **THEN** the app's containers start and the engine reports the stack healthy (HTTP 200 on the
  pod's preview port) before the pod is treated as ready

#### Scenario: Status reports health and running version
- **WHEN** the engine's `status` is queried
- **THEN** it reports whether the stack is healthy and which app version is running

### Requirement: Upgrades are safe by construction

An app upgrade SHALL snapshot first, pull the new image BEFORE touching the running app, health-probe
after, and AUTO-ROLLBACK both the app version and its data if the new version is unhealthy. The engine
SHALL refuse any upgrade or restore that would change or drop the app's encryption key, since that
would silently brick stored credentials.

#### Scenario: A bad upgrade rolls back automatically
- **WHEN** a `safe-upgrade` to a new version fails its post-upgrade health probe
- **THEN** the engine restores the pre-upgrade snapshot (code AND data) and the app is healthy again
  on the previous version, with data intact — without owner intervention

#### Scenario: A key change is refused
- **WHEN** a deploy, upgrade, or restore would run against a different or empty encryption key than
  the one pinned on first deploy
- **THEN** the engine refuses the operation rather than proceed

### Requirement: App data survives restart AND image-update

Everything an app owns — compose file, config, encryption key, and container data volumes — SHALL live
on the pod's persistent home volume, so it survives both a plain restart and an image-update (which
recreates the instance and carries over only the home volume). The stack SHALL return automatically on
every boot with no manual step.

#### Scenario: Restart preserves the running app
- **WHEN** the pod is restarted
- **THEN** the app's containers start again on their own and the stack is healthy with its data intact

#### Scenario: Image-update preserves the app
- **WHEN** the pod is recreated by an image-update
- **THEN** the app redeploys from the home volume and its stored data survives

### Requirement: App envs are cloud-only

`kind: app` SHALL be available only on the cloud edition. On the self-host (OSS) edition it SHALL be
hidden from the catalog and refused at launch, because its docker-compose deploy cannot run in the OSS
OCI-container model (docker-in-docker is unavailable there).

#### Scenario: Self-host hides and refuses apps
- **WHEN** the catalog renders or a launch is attempted on the self-host edition
- **THEN** `kind: app` environments are not offered, and a launch of one is refused with a clear reason

### Requirement: An app env ships a passing smoke test before it is launchable

Every app env SHALL have an automated smoke test that proves, on real infra (a scratch pod),
deploy→healthy, restart-survival, image-update-survival, and safe-upgrade auto-rollback. An app env
without a passing smoke test SHALL NOT be surfaced as launchable in the catalog.

#### Scenario: An unverified app is not offered
- **WHEN** an app env has no passing smoke test
- **THEN** it does not appear as a launchable tile in the catalog

### Requirement: An app env's kickoff makes the agent the service's admin

An app env SHALL, through its kickoff charter, direct the agent to act as the service's always-on
admin: confirm the app is healthy on first run, then offer the user the app's first concrete action,
and end each working turn with a one-line status.

#### Scenario: First run confirms health then offers an action
- **WHEN** an app pod reaches ready for the first time
- **THEN** the agent confirms the app is serving and offers the user a concrete first step for that app
