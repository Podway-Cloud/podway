## RENAMED Requirements

- FROM: `### Requirement: Incus pod guest memory keeps Incus's default backing`
- TO: `### Requirement: Incus pod guest memory is private and mergeable`

## MODIFIED Requirements

### Requirement: Incus pod guest memory is private and mergeable

The Incus provider SHALL back a pod VM's guest RAM with anonymous private memory that KSM may merge
(`mem0` = `memory-backend-ram`, `share = "off"`, `merge = "on"`) on launch, resize and image update,
when the pod's home is a block volume. A pod with a legacy filesystem home SHALL keep Incus's default
backing. The provider SHALL NOT use `share = "off"` on a memfd backend: on 2026-09-25 that kept a second
copy of every page and doubled pod memory.

Each guest page SHALL occupy host memory at most once. The change SHALL be judged by whole-box
available memory over hours, not by KSM's merged-page counter.

The provider SHALL enable free-page reporting on the pod VM's balloon device on launch, resize and
image update, so memory the guest frees is released to the host. Measured 2026-09-28: a 1.2 GB guest
allocation freed returned to the host within 40 seconds.

#### Scenario: A new or updated pod
- **WHEN** the provider creates, resizes or recreates a pod VM whose home is a block volume
- **THEN** the VM's guest RAM SHALL be anonymous, private and mergeable
- **AND** the balloon device SHALL have free-page reporting on

#### Scenario: A pod with a legacy filesystem home
- **WHEN** the provider recreates a pod VM whose home is a filesystem volume
- **THEN** the guest RAM backing SHALL be Incus's default
- **AND** the balloon device SHALL have free-page reporting on

#### Scenario: No second copy
- **GIVEN** a pod VM started with the private backing
- **WHEN** the guest has touched N GiB of RAM
- **THEN** the host memory held for that VM SHALL be about N GiB or less, never about 2N

#### Scenario: A guest frees memory
- **GIVEN** a running pod VM with free-page reporting on
- **WHEN** the guest frees 1 GB it had used
- **THEN** within a minute the host's memory held by that VM SHALL drop by about 1 GB

## ADDED Requirements

### Requirement: The box caches each pod block once

On the Incus box, ZFS SHALL cache only metadata for pod home volumes, because the pod caches its own
home data. Root and image blocks SHALL stay fully cached, because pods cloned from one image share them.
The ZFS cache (ARC) SHALL have a maximum well below half of box RAM (16 GiB on the 125 GiB box). New home
volumes SHALL inherit this policy. These settings SHALL survive a box reboot.

#### Scenario: A new home volume
- **WHEN** the provider creates a home volume for a new pod
- **THEN** that volume SHALL cache only metadata in ARC

#### Scenario: After a box reboot
- **WHEN** the box restarts
- **THEN** the ARC maximum and the home-volume cache policy SHALL be the same as before the restart

### Requirement: The box takes back pod cache only under memory pressure

A box watcher SHALL ask pods to give back page cache ONLY when the box's available memory is below a
low mark, and SHALL stop once it is above a high mark. It SHALL ask through the pod's own memory
reclaim, so the pod drops its least recently used pages first. It SHALL limit how much it takes from
one pod at a time and how often, SHALL skip pods on an exclude list, and SHALL skip a pod that does not
answer within a few seconds. It SHALL NOT restart, pause or resize any pod. It SHALL support a dry-run
mode that only logs what it would do.

#### Scenario: Box has enough memory
- **GIVEN** box available memory is above the low mark
- **WHEN** the watcher runs
- **THEN** it SHALL take nothing from any pod

#### Scenario: Box is short on memory
- **GIVEN** box available memory is below the low mark
- **WHEN** the watcher runs in `on` mode
- **THEN** it SHALL ask the pods with the most page cache to reclaim a bounded amount each
- **AND** it SHALL NOT ask a pod on the exclude list or one it asked within the cooldown

#### Scenario: A frozen pod
- **WHEN** a pod does not answer the watcher within the timeout
- **THEN** the watcher SHALL skip that pod and continue with the others
