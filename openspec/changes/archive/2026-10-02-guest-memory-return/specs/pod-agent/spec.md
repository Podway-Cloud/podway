## ADDED Requirements

### Requirement: An idle pod returns its clean page cache

The pod-agent SHALL drop the guest's CLEAN page cache when the pod has been idle — no agent turn running
and low CPU — for a sustained period, and SHALL do so at most once per rate-limit window. It SHALL NEVER
trim while an agent turn is running, and SHALL never discard dirty data. With free-page reporting on, the
dropped cache returns to the host, so an idle pod stops holding memory it is not using.

#### Scenario: A pod goes quiet
- **GIVEN** a pod whose agent has been idle and whose CPU has been low for the idle period
- **WHEN** the rate-limit window allows
- **THEN** the pod-agent SHALL drop clean page cache once and log it

#### Scenario: The agent is working
- **GIVEN** an agent turn is running
- **THEN** the pod-agent SHALL NOT trim the cache
