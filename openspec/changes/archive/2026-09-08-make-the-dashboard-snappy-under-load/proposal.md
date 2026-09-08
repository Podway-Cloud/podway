## Why

The dashboard stalls exactly when the owner most needs it — while pods are updating, or a build or
deploy is running. Owner report, 2026-09-07: *"the UI is getting slow or even feels stuck from time to
time."*

The cause is measured, not guessed (`docs/plans/ui-responsiveness-and-scale.md`). Baseline is healthy
— `podway.io/signin` median **70 ms**, box load **3.8** — so this is not general slowness. It is one
endpoint under one specific condition.

`/api/pods/live-signals` probes **every running pod** on every poll. Per pod that is two network
calls: `instanceState` (Incus, **30 s** socket timeout) and `/healthz` (3 s). They run six at a time
as a **barrier** — `for (i += 6) { await Promise.all(batch) }` — so the slowest pod in each group
blocks the next group. There is **no server-side cache**, though `fleetHealth` already has one.

And the poll interval drops from 10 s to **3 s** precisely while a pod is transitioning. So during a
fleet update the dashboard polls three times more often, uncached, against an incusd that is busy
doing recreates. Polls overlap and stack.

The cost is `ceil(runningPods / 6) × slowestProbeInRound`, multiplied by **every open tab**. At 100
pods that is ~2.5 s against a 3 s interval — no headroom, and nothing shared between viewers. This is
a cliff, not a gradient: it breaks at the point where one poll cannot finish before the next begins.

## What Changes

Five changes, in leverage order. None of them alter what the dashboard *shows*.

1. **Cache `live-signals` server-side, per owner**, with a short TTL — the same shape `fleetHealth`
   already uses. Makes the cost O(1) per poll regardless of how many tabs are open, and removes the
   per-viewer multiplier entirely. Biggest win, smallest change.
2. **Replace the 6-wide barrier with a worker pool.** `runIdleUpdateBatch` already has the right
   shape: N lanes each pulling the next item, so a slow pod delays only its own lane instead of a
   whole round.
3. **Bound the health probe in UI paths.** Pass a short timeout (2–3 s) to `instanceState` when it is
   serving a dashboard poll. A probe that cannot answer in 3 s should report "unknown", not hold the
   request for 30 s. The 30 s socket timeout stays correct as a general guard.
4. **Skip probing a pod that is mid-update.** Its row already says `updating`; the probe adds nothing
   and it is the most likely pod to be slow.
5. **Per-pod circuit breaker.** After N consecutive probe failures, mark the pod unknown and back
   off, so a pod whose agent never answers stops costing a full timeout on every poll forever.

Recorded but explicitly **not built here**, because both need their own design:

- recreate concurrency is per-call, not global — two owners each get 3, so the box sees 6+
- `MAX_IDS = 24` on the admin update endpoint rejects a larger fleet rather than paging it

## Capabilities

### New Capabilities
_None. This changes how existing behaviour is served, not what it is._

### Modified Capabilities
- `dashboard`: live signals become a cached, bounded, per-owner read. The dashboard's *contents* are
  unchanged; what changes is that a slow or unreachable pod can no longer stall the poll, and
  concurrent viewers share one probe instead of each paying for their own.

## Impact

- `packages/control-plane/src/service.ts` — `liveSignals` (cache + pool + skip-updating + breaker)
- `packages/provider/src/incus/provider.ts` / `http-client.ts` — an optional per-call timeout so a UI
  path can ask for a short one
- `apps/web/app/api/pods/live-signals/route.ts` — currently explicitly uncached
- No schema change, no migration, no edition split: the same path serves cloud and self-host, and the
  cache must not assume a provider.
- Risk to watch: a cache TTL longer than the poll interval would make the UI feel *stale* rather than
  slow — trading one complaint for another. The TTL must stay below the fast (3 s) cadence.
