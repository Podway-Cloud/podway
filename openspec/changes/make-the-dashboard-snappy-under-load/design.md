## Context

`/api/pods/live-signals` is the dashboard's heartbeat. Today it is the most expensive read in the
product and the only one with no cache.

Per poll it lists the owner's pods and, for every RUNNING one, calls `podHealth(id)` →
`fetchHealth(id)`, which makes two network calls:

- `instanceIp()` → `incus.instanceState()` — Incus API, **30 s** socket timeout
- `fetch(http://<ip>:8080/healthz)` — `AbortController`, **3 s**

Those run six at a time as a barrier:

```ts
const CONCURRENCY = 6;
for (let i = 0; i < owned.length; i += CONCURRENCY) {
  const batch = owned.slice(i, i + CONCURRENCY);
  const results = await Promise.all(batch.map(/* probe */));
}
```

`await Promise.all` on each slice means the round finishes at the pace of its slowest member. Five
fast pods and one stalled `instanceState` cost the round up to 30 s.

Two aggravating properties:

- **no server-side cache.** The route is documented "always dynamic, never cached", so every poll from
  every tab re-probes every pod. `fleetHealth` in the same file already has a `maxAgeMs` cache — the
  pattern exists and was simply never applied here.
- **the poll speeds up as the backend slows down.** `refetchInterval` returns 3 s while any pod is
  `updating | waking | provisioning | destroying | resizing`, else 10 s. A fleet update is exactly
  when incusd is busiest.

Measured baseline (2026-09-07, nothing updating): signin median 70 ms, box load 3.8. The system is
healthy at rest; this is a load-shape problem.

## Goals / Non-Goals

**Goals:**
- A dashboard poll costs the same whether one tab is open or ten.
- One slow or unreachable pod cannot stall the whole poll.
- A health probe serving a UI request fails fast and says "unknown" rather than blocking.
- The change is invisible when everything is healthy — same data, same freshness.

**Non-Goals:**
- Changing what the dashboard displays.
- Changing the 3 s / 10 s cadence. If caching makes a poll cheap, the cadence stops mattering; tuning
  it first would be treating the symptom.
- Global recreate admission control, and paging the admin endpoint past `MAX_IDS = 24`. Both are real
  and both need their own design.
- Any schema or migration work.

## Decisions

**1. Cache per owner, TTL below the fast cadence.**
Keyed by owner id, TTL ~2 s — under the 3 s fast poll, so a viewer never sees data older than one
cycle, while N concurrent tabs collapse to one probe. Mirrors `fleetHealth`'s `maxAgeMs` rather than
inventing a second caching idea. A TTL *above* the poll interval would trade "slow" for "stale",
which is a worse complaint because it is silent.

**2. A worker pool, not a barrier.**
Reuse the lane shape already proven in `runIdleUpdateBatch`: N workers each pulling the next pod.
Same ceiling on concurrent probes, but a slow pod delays only its lane. This is the difference
between "the slowest pod in each group of six" and "the slowest pod, once".

**3. Two timeout budgets, chosen by caller.**
`instanceState` keeps its 30 s socket timeout as a general guard — that value is correct for a
control-plane operation and was added deliberately after a stalled daemon left requests pending
forever. UI paths pass a short one (2–3 s). The knob belongs at the call site because the *caller*
knows whether a human is waiting.

**4. Trust the row over a probe for a pod mid-update.**
If `updatingSince` is set, the row already knows the interesting fact. Probing it is both redundant
and the most likely call to be slow, since the instance is being recreated underneath.

**5. Circuit breaker keyed by pod.**
After N consecutive failures, serve "unknown" and back off, with a bounded retry. Without this, one
permanently-silent agent taxes every poll forever — and that pod is precisely the one an owner is
least likely to notice and fix.

## Risks / Trade-offs

- **Stale-vs-slow.** The central risk. Mitigated by a TTL strictly below the fast poll interval, and
  by keeping the cache per owner so a busy fleet cannot poison another owner's view.
- **A cache hides a real outage.** If every probe starts failing, a cache could keep serving the last
  good answer. The breaker must record *unknown*, not the last known-good value — a pod that stopped
  answering should look unknown, never healthy.
- **More concurrency on the box.** A pool without a barrier can keep more probes in flight than the
  batching did. The lane count stays the ceiling, so this is bounded by construction.
- **Self-host parity.** `LocalProvider` has different probe costs. The cache and the pool are
  provider-agnostic; only the short timeout touches the Incus client, and it must remain optional so
  the local path is unaffected.
- **Testability.** The failure only shows under load, which is how it survived this long. Tests
  should assert the *properties* — a slow pod does not delay others, a second call inside the TTL
  makes no probes — rather than trying to reproduce the stall.
