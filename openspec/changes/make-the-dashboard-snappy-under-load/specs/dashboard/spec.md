## ADDED Requirements

### Requirement: Concurrent live-signals reads share ONE fleet sweep
The dashboard's live-signals read MUST be cached server-side per owner AND MUST deduplicate reads
that arrive while a sweep is already running: a caller arriving mid-sweep waits for the running
sweep's result rather than starting its own.

A cache alone does not satisfy this. While a sweep runs the cached value is still stale, so every
poll during it misses and starts another full-fleet sweep — at a 3s poll against a 30s sweep that is
roughly ten concurrent sweeps doing identical work. That stampede, not the absence of a cache, is
the stall.

#### Scenario: Polls arriving while a sweep is in flight
- **WHEN** several live-signals requests for the same owner arrive while a sweep is running
- **THEN** the provider is probed once for the whole group, and every caller is served that result

#### Scenario: A failed sweep does not wedge the owner
- **WHEN** an in-flight sweep throws
- **THEN** the in-flight entry is cleared, and the next request starts a fresh sweep

### Requirement: One slow pod does not delay the others
Health probes MUST run through a worker pool with a fixed lane count, not a batched barrier. A slow
or unreachable pod MUST delay only its own lane.

#### Scenario: A stalled pod among healthy ones
- **WHEN** one pod's probe takes far longer than the rest
- **THEN** the other pods' signals are gathered at their own pace, and the slow pod does not hold back
  pods that would otherwise have completed

### Requirement: A probe serving a user-facing request fails fast
When a health probe is made in service of a dashboard request, it MUST use a short timeout (on the
order of seconds) and report an unknown status on expiry. The longer socket timeout MUST remain for
control-plane operations where no human is waiting.

#### Scenario: The instance API is unresponsive during a fleet update
- **WHEN** the provider does not answer within the user-facing budget
- **THEN** that pod reports unknown and the response returns, instead of the request being held open

### Requirement: A pod that is mid-update is not probed
When a pod's row already records that an update is in flight, live signals MUST take that from the
row and MUST NOT probe the pod.

#### Scenario: Signals during a fleet update
- **WHEN** a pod has an update in flight
- **THEN** its signals reflect the recorded state, and no probe is issued to the instance being
  recreated

### Requirement: A repeatedly unreachable pod stops costing a full timeout
After a bounded number of consecutive probe failures for the same pod, live signals MUST report that
pod as unknown and back off from probing it, retrying on a slower schedule.

#### Scenario: An agent that never answers
- **WHEN** a pod's probe has failed consecutively past the threshold
- **THEN** subsequent polls report it unknown without paying the timeout each time

#### Scenario: An unreachable pod is never reported healthy
- **WHEN** a pod is being served from the breaker or from cache after failures
- **THEN** it is reported as unknown, never as its last known-good value
