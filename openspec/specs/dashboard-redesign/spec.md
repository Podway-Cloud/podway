# dashboard-redesign Specification

## Purpose
The dashboard's shell and pod presentation: a persistent sidebar with a bottom user menu, pods
rendered as a single-column list of full-width row cards, and inline-renamable pod names. Pod cards
expose the highest-value action inline (open, resume, or finish setup) and link to the pod's cockpit
for the full set of controls; launching a new environment lives on a dedicated environments page.
## Requirements
### Requirement: The dashboard uses a sidebar shell with a bottom user menu

The dashboard SHALL present a persistent sidebar with a clickable logo (→ `/dashboard`), primary
nav, and a user menu pinned to the bottom that holds Sign out. There is no account-level login
management here — agent logins live per pod on each pod's own volume.

#### Scenario: User menu holds the sign-out action

- **WHEN** the user opens the bottom user menu
- **THEN** it shows a Sign out action (not in the top-right or a page footer) and no account-level
  login management

### Requirement: Pods render as a single-column list of row cards

Pods SHALL render as a single-column list of full-width row cards. Each card SHALL reflow within
itself to the viewport (a horizontal row on wider widths, stacking vertically on mobile) with no
horizontal overflow and no button wrapping.

#### Scenario: Cards reflow on mobile

- **WHEN** the dashboard is viewed at a mobile width
- **THEN** each card's contents stack vertically and no controls overflow or wrap awkwardly

#### Scenario: Card exposes a primary action and links to the cockpit

- **WHEN** a pod card renders
- **THEN** it shows the highest-value primary action for the pod's state (Open in Claude when
  running, Resume when suspended, Finish setup while onboarding), an optional Preview link, and the
  whole card links to the pod's cockpit where the full controls (Suspend, Resize, Delete) live. The
  card-level cockpit link SHALL be separate from its action buttons so keyboard and
  assistive-technology users do not encounter nested links.

### Requirement: A pod has an editable name

A pod SHALL have an optional name (falling back to its slug) that the owner can rename inline.

#### Scenario: Rename persists

- **WHEN** the owner renames a pod on its card
- **THEN** the new name persists and is shown on reload; clearing it falls back to the slug

#### Scenario: Rename is owner-scoped

- **WHEN** a non-owner attempts to rename a pod
- **THEN** the operation is rejected

### Requirement: The dashboard routes to a dedicated "Create a pod" page to launch

The dashboard SHALL NOT embed the environment gallery. Instead it SHALL offer a launch entry point
(a "New pod" action, and a "Create your first pod" call-to-action in the empty state) that routes
to the dedicated catalog page (`/dashboard/create`), which hosts the gallery of launchable
environments. The page was renamed from "Environments" to "Create a pod"; the old
`/dashboard/environments` path SHALL remain reachable as a redirect to `/dashboard/create` so
existing bookmarks and links keep working.

#### Scenario: Empty state offers a single launch CTA

- **WHEN** the user has zero pods
- **THEN** the dashboard shows a "No pods yet" box with exactly one "Create your first pod" CTA
  that routes to `/dashboard/create`

#### Scenario: Launch entry point is present with pods too

- **WHEN** the user has one or more pods
- **THEN** the dashboard still offers a "New pod" action that routes to `/dashboard/create`

#### Scenario: The legacy environments path still resolves

- **WHEN** a request hits `/dashboard/environments`
- **THEN** it SHALL redirect to `/dashboard/create` rather than 404 or render stale content

### Requirement: Pod cards show a live status dot

Each pod card SHALL show a live status dot reflecting the pod's status (running, suspended,
building, and so on). It does not render a mini-terminal-preview slot or a separate agent-state dot.

#### Scenario: Card shows a status indicator

- **WHEN** a pod card renders
- **THEN** it shows a status dot whose colour reflects the pod's current status

### Requirement: The dashboard offers a themeable appearance

The dashboard SHALL support three themes — **podway** (the default navy-dark look), **dark** (a
neutral dark theme), and **light** — applied via `next-themes` (`attribute="data-theme"` on
`<html>`, `storageKey="podway-theme"`). The owner's choice SHALL persist per-browser across visits.
An **Appearance** switcher on the Settings page SHALL let the owner pick between the three.

The design-token contract lives in `globals.css`: subtle dashboard surfaces SHALL be drawn from
`var()`-based alpha tokens (`--surface-1`/`--surface-2`/`--surface-3`, exposed as the
`bg-surface-1/2/3` utilities) rather than hardcoded `bg-white/[0.0x]` opacities, so a theme change
re-themes every surface at runtime with no per-component edits. Public/marketing pages (the landing
site) SHALL NOT be affected by the theme switch — they keep their own legacy CSS variables and
always render the podway look, regardless of the signed-in owner's dashboard preference.

#### Scenario: A theme is selectable and persists

- **WHEN** the owner picks a theme (podway, dark, or light) from the Settings Appearance switcher
- **THEN** the dashboard SHALL immediately re-render in that theme and SHALL still be in that theme
  on the owner's next visit (persisted per-browser)

#### Scenario: Design tokens drive dashboard surfaces

- **WHEN** the theme changes
- **THEN** every dashboard surface built from the `--surface-1/2/3` tokens (cards, rows, hover
  states) SHALL re-theme without any component-level code change, because those utilities resolve
  through `var()` rather than a fixed opacity value

#### Scenario: Public pages are unaffected by the dashboard theme

- **WHEN** an owner has selected `dark` or `light` for the dashboard
- **THEN** the public/marketing landing pages SHALL still render in the podway look, unaffected by
  that preference
