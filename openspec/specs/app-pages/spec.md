# app-pages Specification

## Purpose
Public marketing URLs outside the landing. The per-app hosting pages (`/apps`, `/apps/<slug>`) and the
Upgrade Radar (`/radar` + its private ingest) were built 2026-10-07 and REMOVED 2026-10-08 by the owner
(not original enough; the app pages were ~90% identical; the radar idea was overloaded). Cloud only.
## Requirements
### Requirement: Removed pages redirect to the landing

`/apps` and `/apps/<slug>` SHALL temporarily redirect to the landing's app list (`/#apps`), and `/radar`
SHALL temporarily redirect to `/`. `POST /api/radar/ingest` SHALL NOT exist. (Temporary: "removed for now".)

#### Scenario: An old app-page link
- **WHEN** a visitor opens /apps/umami
- **THEN** they land on /#apps

### Requirement: No standalone /pricing page

The old dev-pod `/pricing` page SHALL NOT exist; `/pricing` SHALL permanently redirect to the landing's
pricing section (`/#pricing`) so old links still land on current prices.

#### Scenario: An old /pricing link
- **WHEN** a visitor opens /pricing
- **THEN** they are redirected (308) to /#pricing
