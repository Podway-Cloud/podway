## Context

App-pods (`kind: app`) run a real deploy on first boot via their `setup` steps (n8n: `docker compose up`
pulling ~700 MB). The env's setup already writes to `~/.podway-setup.log`, and `boot.ts`'s
`WAIT_FOR_SETUP` blocks the agent (and thus RC) until `~/.podway-setup-done` exists — so the onboarding's
"Starting your agent" step legitimately waits out the deploy. The pod-agent already serves `/healthz`
(the cockpit polls it via react-query); the onboarding reads agent state from there. The missing piece
is a way to show WHAT the setup is doing without the platform knowing anything app-specific.

## Goals / Non-Goals

**Goals:**
- One generic mechanism that works for every current and future app/env — the ENV declares its
  milestones, the platform only relays the latest one.
- Cheap to adopt: an env opts in by printing one line; opting out is doing nothing.
- Safe to surface: no raw log dump, no secrets, bounded length.

**Non-Goals:**
- Per-app log parsing / any app-specific code in the platform (explicitly rejected by the owner).
- A full multi-step progress timeline / historical log view in onboarding.
- Streaming the raw setup log to the UI (off-brand + secret risk — see the rejected alternative).

## Decisions

1. **Marker format: `podway-progress: <message>` on stdout, plus `~/.podway-progress`.** A setup step
   prints `echo "podway-progress: Pulling n8n…"`; init.sh already tees setup output to
   `~/.podway-setup.log`. As the authoritative CURRENT value, the emitter (or a tiny helper) also writes
   the bare message to `~/.podway-progress`. The pod-agent prefers `~/.podway-progress` if present, else
   greps the last `podway-progress:` line from the setup log. Rationale: a plain `echo` is the
   lowest-friction thing an env author can do, and a file gives an unambiguous "latest".

2. **The pod-agent surfaces ONE field, `setupProgress`, on `/healthz`.** Last marker only (not history),
   `cleanStr`-sanitized (control chars stripped, capped at the existing `MAX_HEALTH_STR`). It is present
   only while setup is running (between `~/.podway-setup-running` and `~/.podway-setup-done`); once
   setup is done the field is null and the onboarding proceeds as today. Rationale: reuses the existing
   health trust-boundary sanitizer; bounded + transient by construction.

3. **Onboarding renders `setupProgress` in the existing "Starting your agent" step.** When present, the
   step's line shows the milestone ("Pulling n8n…") instead of / alongside the fixed
   "enabling remote control…" copy; when absent, unchanged. No new step, no new route. The
   control-plane/gateway already pass agent health through, so `setupProgress` rides that path with no
   new plumbing beyond the field.

4. **n8n is the first emitter.** Its `setup` (and/or `bin/app-admin.sh deploy`) emits: before the pull
   "Pulling n8n…", after Postgres is healthy "Starting the database…", on `DEPLOYED healthy`
   "n8n is live". These live in the ENV, not the platform.

## Risks / Trade-offs

- **A hostile/buggy env could emit misleading text.** Mitigation: the pod runs the owner's own trusted
  first-party env here; the field is sanitized + length-capped like every other `/healthz` string, so
  the worst case is a wrong-but-harmless label, never injection or a leak.
- **Secrets in a marker.** An env author could `echo "podway-progress: key=$SECRET"`. Mitigation: the
  convention doc says never put secrets in a marker; envs already never echo secrets to stdout; and the
  cap limits blast radius. (We do not attempt secret detection — that's the env's contract to keep.)
- **Timing granularity.** With only three markers the bar still sits between milestones for many
  seconds. Accepted: three honest milestones beat a blank spinner, and finer progress is a non-goal.
- **Older pod images** don't emit the field → onboarding falls back to today's behavior. Back-compat by
  construction (optional field, treated as absent).
