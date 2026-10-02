## Why

An Incus pod VM holds every page of RAM its guest has ever touched, forever: the host never learns the
guest freed it. Guests fill RAM with page cache over hours, so the box (128 GB) ends up fully used by
memory the pods are not using — on 2026-09-28 free RAM fell from 40 GB to 5 GB in a morning with swap
full. The box capacity gate (#356) stops new over-promising, but it cannot give back memory already held.

## What Changes

- The Incus provider turns on **free-page reporting** on each pod VM's existing `virtio-balloon-pci`
  device (`raw.qemu.conf`: `[device "qemu_balloon"] free-page-reporting = "on"`) at create, resize and
  image update. The guest kernel then reports freed pages and QEMU releases them to the host.
  Measured 2026-09-28 on 2 GiB scratch VMs: a 1.2 GB guest alloc+free returned to the host in < 40 s
  (qemu RSS 1988 → 1074 MB), while the control VM stayed at 2085 MB; whole-box `Shmem` fell by the same
  1042 MB — memory genuinely freed, nothing duplicated.
- The pod-agent **trims clean guest page cache when the pod is idle** (no agent turn and low CPU for a
  while, rate-limited), so cached memory also returns via reporting. A kept 800 MB file cache held
  1594 MB until dropped (→ 1046 MB).
- The provider requirement "guest memory keeps Incus's default backing" is narrowed: `mem0` backing stays
  untouched (the KSM lesson stands); the balloon device may carry `free-page-reporting`.
- Rollout rides normal pod updates (the setting only changes while a VM is stopped); pilot on test pods
  with whole-box before/after measurement over hours before any fleet-wide push.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `sandbox-provider`: the Incus guest-memory requirement allows (and requires) free-page reporting on the
  balloon device, while still forbidding any `mem0` backing override.
- `pod-agent`: new requirement — idle guest cache trim, rate-limited, never while the agent is working.

## Impact

- `packages/provider/src/incus/provider.ts` (`guestMemoryConfig` → balloon override; create/resize/update).
- `packages/pod-agent/src` (idle detector + `drop_caches` 1, root); pod-base image for the pod-agent side.
- Box memory: expected large recovery on idle pods; verified only by whole-box measurement.
- Self-host (`LocalProvider`, Docker) unaffected — containers already share host page cache.
