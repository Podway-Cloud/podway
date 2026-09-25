## ADDED Requirements

### Requirement: Incus pod guest memory is mergeable by KSM

The Incus provider SHALL create every pod VM with private guest memory — `raw.qemu.conf` overriding
`[object "mem0"]` with `share = "off"` — on launch, on resize, and on the image-update recreate, so the
host's KSM can merge identical pages across pods. Incus's default shared memfd is invisible to KSM (it
merged ~130MB across 17 VMs; private memory measured ~35% of pod RAM on scratch pods, 2026-09-25).
The provider SHALL NOT restart a running pod only to apply it; an existing pod takes it on its next
recreate (Update).

#### Scenario: A new pod is created
- **WHEN** the Incus provider launches a pod
- **THEN** the instance config SHALL carry `raw.qemu.conf` setting `share = "off"` for `mem0`

#### Scenario: An existing pod is updated
- **WHEN** a pod is recreated by an image update or a resize
- **THEN** the recreated instance SHALL carry the same override, preserving its sizing

#### Scenario: Self-host is unaffected
- **WHEN** a pod runs on the self-host `LocalProvider` (Docker)
- **THEN** nothing changes — there is no guest VM memory to merge
