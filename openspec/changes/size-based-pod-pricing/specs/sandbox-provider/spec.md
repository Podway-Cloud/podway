## ADDED Requirements

### Requirement: Per-size resources follow the box's RAM:disk ratio

A pod's reserved resources SHALL be derived from its size anchored to RAM, with disk allocated in the
box's natural ratio (~13 GB disk per GB RAM) rather than the previous ~2.5 GB/GB, and CPU allocated as
a burstable ceiling (~0.5–1 vCPU per GB, overcommitted, never a hard reservation). Disk remains a
grow-only quota: raising the default SHALL apply to new pods and to an explicit resize, and SHALL NOT
shrink or disturb an existing pod's volume.

#### Scenario: A new pod gets the RAM-anchored disk

- **WHEN** a pod is created at a given size
- **THEN** its root volume SHALL be provisioned at that size's disk figure from the tier table (e.g.
  Medium = 50 GB), not the legacy ~2.5 GB/GB value

### Requirement: Suspending archives the pod's volume off the box; resuming restores it

Suspending a pod SHALL move its storage volume OFF the box to cold storage (freeing the box's RAM,
CPU, and disk), and resuming SHALL restore that volume back to the pool and boot the pod. The
operation SHALL be safe against interruption — a failed archive SHALL leave the pod resumable in place
rather than lose data — and the UI SHALL surface the restore as an in-progress state ("restoring…")
because resume is no longer instant.

#### Scenario: Suspend frees the box, resume brings it back

- **WHEN** an owner suspends a pod
- **THEN** the pod's volume SHALL be archived to cold storage and its box resources released; and
  **WHEN** the owner later resumes it, the volume SHALL be restored intact and the pod booted

#### Scenario: A failed archive does not lose data

- **WHEN** archiving a suspended pod's volume fails partway
- **THEN** the pod's data SHALL remain intact and the pod SHALL still be resumable, rather than being
  left in a corrupt or unrecoverable state
