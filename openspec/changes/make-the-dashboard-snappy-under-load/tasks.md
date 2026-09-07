# Tasks — make the dashboard snappy under load

Ordered by leverage. 1 alone should remove most of the observed stall; each step is independently
shippable and independently revertible.

## 1. Stop the live-signals STAMPEDE (biggest win, smallest change)
**Correction (2026-09-07):** the proposal said "add a per-owner cache". It was already there —
`liveSignalsCache`, 10s TTL, `service.ts`. The cache was never the missing piece, so the diagnosis
was wrong even though the symptom was real. What is missing is IN-FLIGHT DEDUPLICATION: a miss
starts an expensive gather, and while it runs the cache is still stale, so the next poll misses too
and starts its OWN full-fleet gather. At a 3s poll against a 30s gather that is ~10 concurrent
sweeps of the whole fleet, each doing the same work.
- [x] 1.1 Single-flight `ownerLiveSignals` on a `liveSignalsInFlight` map: a caller arriving while a
  gather runs awaits THAT promise instead of starting another. Cleared in a `finally`.
- [x] 1.2 Keyed by owner id, so one busy fleet cannot stall another owner.
- [x] 1.3 Test: five concurrent callers over 2 pods → 2 probes, not 10. Proven to fail without the fix.
- [x] 1.4 The existing 10s TTL is kept — with the stampede gone it is doing its job.

## 2. Worker pool instead of the 6-wide barrier
- [x] 2.1 Replace `for (i += CONCURRENCY) { await Promise.all(batch) }` in `liveSignals` with the lane
  pattern already used by `runIdleUpdateBatch` — N workers each pulling the next pod.
- [x] 2.2 Same for `fleetHealth`, which has the identical barrier.
- [x] 2.3 Test: with one deliberately slow probe among fast ones, the fast pods are not held to the
  slow one's pace. Assert the PROPERTY, not a wall-clock number.

## 3. A short probe budget for user-facing paths
- [x] 3.1 Let `instanceState` (and the incus http-client) take an optional per-call timeout; keep the
  30s default for control-plane callers, where it was added deliberately.
- [x] 3.2 Pass 2–3s from the live-signals path; on expiry the pod reports UNKNOWN, not healthy.
- [x] 3.3 Confirm `LocalProvider` is unaffected — the option must be optional, not required.

## 4. Do not probe a pod that is mid-update
- [x] 4.1 In `liveSignals`, when `updatingSince` is set, take the state from the row and skip the probe.
- [x] 4.2 Test: a pod with an update in flight yields signals with no provider call for that pod.

## 5. Per-pod circuit breaker
- [x] 5.1 Track consecutive probe failures per pod; past a threshold, report unknown and back off with
  a bounded retry.
- [x] 5.2 Reset on the first success.
- [x] 5.3 Test: an always-failing pod stops being probed every poll.
- [x] 5.4 Test: a broken pod is reported UNKNOWN, never its last known-good value. A cache that keeps
  serving "healthy" through an outage is worse than the slowness this change fixes.

## 6. Verify it actually helps
- [x] 6.1a SYNTHETIC before/after, same harness, only `service.ts` swapped (2026-09-07). 15 pods,
  3 mid-update, 2 slow (1.5s), 1 dead; TWO tabs polling every 3s for 20 ticks. The dead pod costs
  the caller's budget — none on the old path, so the incus 30s default.

  | | probes | p95 latency | wall for 20 polls |
  |---|---|---|---|
  | before | 150 | **30190 ms** | 211 s |
  | after | 58 | **3083 ms** | 72 s |

  Worst-case dashboard response 30.2s → 3.1s; probe count −61%; and the 72s wall is essentially the
  20×3s poll spacing, i.e. the poll stopped running late. Two tabs did NOT double the probes (6.2).
- [ ] 6.1b REAL fleet measurement still owed — needs `deploy-app.sh web` (🔴 gated). The synthetic
  numbers model the mechanism, not the box: real incusd contention is not simulated here.
- [x] 6.2 Two tabs open: probe count does not double — single-flight collapses them (covered above
  and by the concurrent-callers test).
- [x] 6.3 `openspec validate … --type change` → valid. Archive on ship.

## Recorded, NOT built here
- [ ] R.1 Recreate concurrency is per-CALL, not global: two owners each get 3, so the box sees 6+.
  Needs global admission control in the control plane. (The 2026-09-04 box stall was this shape.)
- [ ] R.2 `MAX_IDS = 24` on the admin update endpoint rejects a larger fleet instead of paging it.
