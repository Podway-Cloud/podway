## MODIFIED Requirements

### Requirement: Launch creates a durable provisioning record

`launchPod(ownerId, environmentName, opts)` SHALL resolve a first-party environment (via
`@podway/shared`), then create and persist a pod record in status `provisioning` linking the pod
to its owner and environment BEFORE any machine exists. The record SHALL be durable and
URL-addressable the instant launch returns; it does not create a provider machine synchronously.
The record's row itself is the provisioning job.

#### Scenario: Successful launch returns a provisioning record

- **WHEN** `launchPod` is called with a valid environment name
- **THEN** a record SHALL be stored with the owner, environment, pod id, chosen lifecycle, chosen
  compute size (defaulting to **Medium**), and status `provisioning`, and that record SHALL be
  returned without waiting for a machine to be built

#### Scenario: Unknown or unsafe environment is rejected

- **WHEN** `launchPod` is called with an environment that does not resolve or whose name is unsafe
- **THEN** it SHALL fail without creating any provider resource or store record

#### Scenario: Launch persists validated secrets

- **WHEN** `launchPod` is given secret values for keys the environment declares
- **THEN** unknown keys SHALL be rejected, blank values dropped, and the accepted values SHALL be
  persisted with the record

## REMOVED Requirements

### Requirement: An account has a slot budget

**Reason:** The slot unit (memory ÷ 4 GB, box = 40 slots, account = 4) is being removed in favour of
size-based pricing. With flat per-pod billing, an artificial slot quota is the wrong lever: an owner
pays for exactly what they run, so capacity is governed by (a) the box's RAM budget and (b) an
optional per-account pod cap for abuse control — neither expressed in slots.

**Migration:** `slotsForSize`, `PODWAY_BOX_SLOTS`, and the `slot_limit` control error are deleted.
Box capacity admission moves to a RAM budget (see the ADDED requirement below); the per-account limit,
where kept, becomes a plain pod-count or RAM cap rather than a slot budget. Existing pods are
unaffected — their size maps directly to the new tier.

## ADDED Requirements

### Requirement: Box capacity is admitted against a RAM budget, not slots

The platform SHALL admit new or resumed pods against a **sellable-RAM budget** for the box (its
physical RAM minus a host reserve), refusing before any side effect when the sum of running pods' RAM
would exceed the budget; the refusal SHALL be a distinct, surfaced error. CPU SHALL NOT be a hard
admission gate (it is burstable/overcommitted); disk SHALL be checked against the storage pool's free
space. A suspended pod SHALL NOT count against the RAM budget (its compute is released and its volume
archived off the box). Admin/exempt accounts SHALL remain unbounded so they can run the fleet.

#### Scenario: A launch that would exceed the box RAM budget is refused with no side effect

- **WHEN** launching or resuming a pod would push running pods' summed RAM past the box budget
- **THEN** the operation SHALL be refused with a distinct capacity error and no pod record or machine
  SHALL be created or resumed

#### Scenario: Suspended pods do not consume the budget

- **WHEN** a pod is suspended
- **THEN** its RAM SHALL be released from the budget (freeing room for another pod), and resuming it
  SHALL re-check the budget and be refused if the room has since been taken

### Requirement: A pod's billed rate follows its running/suspended state

The control plane SHALL bill a pod its size's running price while it is running and the flat suspended
rate while it is suspended, switching the rate as part of the suspend/resume lifecycle so the two
never disagree (a pod reading "suspended" SHALL never be billed the running price, and vice versa).

#### Scenario: Rate switches with lifecycle state

- **WHEN** a pod transitions between running and suspended
- **THEN** its billed rate SHALL switch to match the new state as part of the same transition, so
  billing state and lifecycle state stay consistent
