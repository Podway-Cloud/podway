# app-pages Specification

## Purpose
Public, indexable "<App> hosting" pages and the Upgrade Radar (GTM plan, owner approved 2026-10-07): one page per offered app, an index of all apps, and a daily list of fresh upgrade breaks fed by the GTM pod through a private ingest. Cloud only.
## Requirements
### Requirement: One hosting page per offered app
`/apps` SHALL list every offered app (kind `app`, not in `HIDDEN_APPS` in `apps/web/lib/app-catalog.ts`),
each linking to `/apps/<slug>`. Each page SHALL show the app's one-liner, a price taken from its env's
`minSize` (never a hard-coded price), a `/start?app=<slug>&ref=page-<slug>` call to action, the
snapshot-and-rollback promise, the AI admin, what it replaces, and a FAQ, with SoftwareApplication +
FAQPage structured data. Claims SHALL be limited to the approved shared facts. An unknown slug SHALL 404.
Every offered app SHALL have copy, and no copy SHALL exist for an app that is not offered.

#### Scenario: A visitor opens an app page
- **WHEN** a visitor opens `/apps/twenty`
- **THEN** the page SHALL say "Run Twenty without running a server.", show "From $7/month" (Twenty is a
  Small pod), and link "Start Twenty on Podway" to `/start?app=twenty&ref=page-twenty`

### Requirement: Upgrade Radar from a private ingest
The GTM pod SHALL post its daily radar JSON to `POST /api/radar/ingest` with `Authorization: Bearer
$RADAR_INGEST_TOKEN`; a missing, wrong, or short (<32 chars) configured token SHALL refuse with 401 and
write nothing. The feed SHALL be validated before it is stored: an item whose link is not a
`https://github.com/<owner>/<repo>/issues/<n>` URL, whose slug is not kebab-case, or whose text is over
its limit SHALL be dropped, and the response SHALL name each dropped item and its bad fields (`reasons`); a bad envelope or more than 500 items SHALL be rejected. `/radar` SHALL show
the newest feed grouped by app (most breaks first) with a "Run <App> on Podway" call to action for
offered apps, and each `/apps/<slug>` page SHALL show that app's 3 most recent breaks.

#### Scenario: A feed is posted
- **WHEN** the GTM pod posts a valid feed with the right token
- **THEN** `/radar` and the matching `/apps/<slug>` page SHALL show its items

#### Scenario: A stranger posts
- **WHEN** a request without the token posts to the ingest
- **THEN** it SHALL get 401 and nothing SHALL be stored
