## ADDED Requirements

### Requirement: An environment may declare a minimum pod size

An environment definition MAY declare a minimum (or recommended) pod size. When present, the value
SHALL be one of the defined pod sizes and represents the floor at which the environment's prebuilt
stack runs correctly (for example, an app that runs a service plus its database needs more memory than
a static workspace). When absent, the environment carries no floor and launches at the picker's global
default, exactly as today.

#### Scenario: A declared floor validates against the known sizes
- **WHEN** an environment definition declares a minimum size
- **THEN** the definition validates only if that value names a known pod size; an unknown size is a
  validation error, and an omitted floor is valid
