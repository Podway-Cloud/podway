## MODIFIED Requirements

### Requirement: Incus pod guest memory keeps Incus's default backing

The Incus provider SHALL NOT override a pod VM's guest-memory backing (`mem0`) on launch, resize or image
update, and a resize SHALL remove a `mem0` override from a pod that still has one. The 2026-09-25 attempt
(`share = "off"` on Incus's memfd backend, to let KSM merge guest RAM) DOUBLED pod memory and the box ran
out of memory on 2026-09-27. Any future KSM work SHALL use an anonymous backend and SHALL be judged by
whole-box free memory, not by merged pages.

The provider SHALL enable free-page reporting on the pod VM's existing balloon device on launch, resize
and image update, so memory the guest frees is released to the host. That override SHALL touch only the
balloon device. Measured 2026-09-28: a 1.2 GB guest allocation freed returned to the host within 40
seconds, and whole-box shared memory fell by the same amount.

#### Scenario: A new or updated pod
- **WHEN** the provider creates, resizes or recreates a pod VM
- **THEN** the instance config SHALL carry no `mem0` memory override
- **AND** the balloon device SHALL have free-page reporting on

#### Scenario: A guest frees memory
- **GIVEN** a running pod VM with free-page reporting on
- **WHEN** the guest frees 1 GB it had used
- **THEN** within a minute the host's memory held by that VM SHALL drop by about 1 GB
