## MODIFIED Requirements

### Requirement: A recorded image may carry a release version, additive to its digest

A manifest row MAY carry a release version label. The canonical 64-char digest SHALL remain the
image's identity for every decision about what boots or what is compared — the launch alias, the
pinned digest, digest normalization, and prune protection. The version SHALL affect presentation
only, SHALL be stored per row, and SHALL be optional: a row without one is valid and renders with the
existing digest-and-date presentation (every pre-versioning row is in this state, so it is the common
path, not an edge case). Version is stored per row rather than derived so a re-promoted (rolled-back)
image shows its OWN earlier version rather than the newest ever recorded.

#### Scenario: A row without a version stays valid

- **WHEN** a manifest row has no version
- **THEN** it SHALL remain valid and SHALL render with the existing digest-and-date presentation

#### Scenario: Recording accepts a version, or inherits the current one

- **WHEN** an image is recorded (or re-recorded) with a version supplied
- **THEN** the version SHALL be stored on that row (the release-cutting path)

#### Scenario: A build with no version inherits the current version

- **WHEN** a promoting build is recorded with NO version and a current image already carries one
- **THEN** the new row SHALL inherit that current version and SHALL NOT advance it — an ad-hoc rebuild
  (a CLI-pin bump, a hotfix build) shows the live version, not a bare digest (release-versioning);
  advancing the version is the deliberate, separate release-cutting step
- **WHEN** no version is supplied and there is no current version to inherit (a pre-versioning fleet)
- **THEN** the row SHALL keep a null version and render with the existing digest-and-date presentation

#### Scenario: A partial re-record preserves fields it does not supply

- **WHEN** an already-recorded image is re-recorded with only some fields (e.g. attaching just a
  version)
- **THEN** the fields the caller did NOT supply — summary, build time, size, alias, changelog — SHALL
  retain their stored values rather than being cleared, so a partial update never destroys the rest of
  the row
- **AND** a field arriving as `null` because the caller omitted it (the record API coerces every
  omitted field to `null`) SHALL be treated as NOT supplied — never as an instruction to clear the
  stored value — so cutting a release (which sends only the digest + version) preserves the whole row

#### Scenario: Version never displaces the digest as identity

- **WHEN** an image carries a version
- **THEN** pinning, promotion, comparison and prune protection SHALL continue to use the canonical
  digest, and the version SHALL affect presentation only

#### Scenario: Rolling back shows the version going backwards

- **WHEN** an operator re-promotes a previously superseded image that carries an earlier version
- **THEN** the owner-facing version SHALL show that earlier version, reflecting what is actually
  running rather than the newest version ever recorded

#### Scenario: The version is shown WITH the digest, never instead of it

- **WHEN** a build's identity is shown to an owner or an admin (the cockpit's up-to-date line, the
  update dialog, the bulk-update dialog, the admin image and pod views)
- **THEN** the version SHALL be shown together with the short digest (e.g. `v0.4.2 (a1b2c3)`), and the
  digest SHALL NOT be dropped — a version is not unique per build, so the digest remains needed to
  disambiguate two builds that share a version

### Requirement: The owner sees a user-facing summary first, the commit changelog second

An image row MAY carry a hand-written `summary` — a short "what's new for you" written from the
owner's point of view (an outcome, not a code change). When present, the update view SHALL lead with
the `summary` and demote the git-derived `notes` to a secondary, collapsed "technical changes"
disclosure; when no summary exists it SHALL fall back to the parsed changelog so the view is never
blank, and the one-line prompt SHALL likewise prefer the summary.

The summary SHALL be sourced from the release description when the build belongs to a release. The
`notes` SHALL remain auto-derived from the commit range and SHALL NOT be replaceable by hand-written
text — they are the honesty layer that reports a no-change rebuild as such, and a written description
may only lead them.

Re-recording an image that is already recorded SHALL NOT recompute its changelog from an empty commit
range. Doing so produced notes that claimed "the same software, rebuilt" for a build that did change
what pods run (observed 2026-08-29 while adding a missing summary), which is precisely the false
statement the honest-empty-case rule exists to prevent.

#### Scenario: Summary leads, commits are secondary

- **WHEN** an image with a `summary` and commit `notes` is shown in the update view
- **THEN** the `summary` SHALL be the prominent text and the commit `notes` SHALL be presented only
  as a demoted/collapsed "technical changes" list, not as the headline

#### Scenario: No summary falls back to the changelog

- **WHEN** an image without a `summary` is shown
- **THEN** the cockpit SHALL show the parsed commit changelog rather than an empty summary

#### Scenario: A release description leads the update view

- **WHEN** an image belonging to a release is offered as an update
- **THEN** the view SHALL lead with the release description and demote the commit changelog

#### Scenario: Re-recording preserves the original changelog

- **WHEN** an already-recorded image is recorded again (for example to attach a description that was
  missing)
- **THEN** its previously derived changelog SHALL be preserved rather than recomputed against an empty
  range, and the image SHALL NOT be described as an unchanged rebuild
