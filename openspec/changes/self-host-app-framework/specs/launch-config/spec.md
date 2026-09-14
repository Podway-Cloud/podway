## ADDED Requirements

### Requirement: The size picker honors an environment's minimum size

When an environment declares a minimum pod size, the launch size picker SHALL default the pod to at
least that size and SHALL prevent launching below it (with a clear reason). An environment with no
declared minimum behaves exactly as today (the global default, freely adjustable).

#### Scenario: The picker defaults up to the environment's floor
- **WHEN** the owner opens the launch flow for an environment whose minimum size is above the global
  default
- **THEN** the size picker starts at (at least) that minimum rather than the global default

#### Scenario: Below-floor launches are prevented
- **WHEN** the owner tries to launch an environment at a size below its declared minimum
- **THEN** the launch is prevented (or the picker disallows the below-floor choice), with a clear
  explanation of the floor
