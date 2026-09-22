## Why

An app-pod's first boot runs a real deploy — the n8n environment pulls the Postgres + n8n container
images (~700 MB, ~1 minute) before the app is up. During that wait the onboarding shows a generic
"enabling remote control…" spinner with no feedback, so the owner can't tell whether it's working or
hung (owner report, n8n pod, 2026-09-01). Any env with a slow first-boot setup has the same gap.

The naive fix — parse the raw setup log for milestones — does not scale: it would need a custom parser
per app (n8n, then Ghost, then Cal.com…), and it risks surfacing raw `docker` internals (layer hashes)
and secrets to a product whose whole pitch is "we handle the ops." The owner call is explicit: **no
per-app parsing.**

## What Changes

Introduce a GENERIC progress convention so the environment declares its own milestones and the platform
stays dumb — one reader, every app:

- A setup step (or the env's maintenance engine, e.g. `app-admin.sh`) emits structured markers:
  a line `podway-progress: <human message>` on stdout (captured to `~/.podway-setup.log`), and/or a
  small `~/.podway-progress` file holding the current message.
- The **pod-agent** surfaces the CURRENT (last-seen) marker generically — one new field on `/healthz`
  — with the message length-capped and control-chars stripped so no raw dump or secret leaks through.
- The onboarding (cockpit "Starting your agent" step) renders that current milestone instead of the
  fixed spinner text; an env that emits no markers falls back to the existing spinner (opt-in, zero
  coupling).
- The **n8n environment** becomes the first emitter: its setup/`app-admin.sh` prints
  "Pulling n8n…", "Starting the database…", "n8n is live".

Out of scope: a richer multi-step progress TIMELINE UI, and per-app log parsing (explicitly rejected).

## Capabilities

### New Capabilities
- `deploy-progress`: a generic, env-declared setup-progress convention — the marker format, the
  pod-agent surfacing rule (last marker, scrubbed + length-capped), and the onboarding fallback — with
  no platform knowledge of any specific app.

### Modified Capabilities
- `environment-spec`: an environment (its `setup` steps or bundled scripts) MAY emit `podway-progress:`
  markers to communicate first-boot progress; doing so is optional and declares the env's own
  milestones.

## Impact

- `packages/pod-agent` — read the last `podway-progress:` marker (setup log tail or `~/.podway-progress`)
  and expose it on `/healthz`, scrubbed + capped.
- `packages/shared` — add the optional field to the health/agent-state protocol type.
- `apps/web` — onboarding "Starting your agent" step renders the current milestone when present.
- `environments/n8n` — `setup` / `bin/app-admin.sh` emit the n8n milestones.
- Secrets: the surfaced text is capped + control-char-stripped; envs are told never to put secrets in a
  marker (they already never echo secrets to stdout).
