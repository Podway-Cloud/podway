# Proposal — allocate pod swap on TOP of the disk quota

## Why
The per-pod swapfile (`/home/dev/.swapfile`, size `min(RAM, 4G)`, created by
`scripts/incus/provision-pod-base.sh`) lives on the user's **persistent home volume** — so it
counts against the disk quota advertised by the pod size. A customer gets 2–8% less usable disk
than their tier states (Mini/Small/Medium 8%, Large 4%, XL 2%). It is small, but it is not honest to
the number we sell. Owner decision (velsa, 2026-09-23): the user should get their **full advertised
disk**, with swap allocated on top.

## What
Provision the home volume as `resolveResources().diskGb + swapReserveGb`, where
`swapReserveGb = min(memoryGb, 4)`. The user's usable/`df` disk then ≈ the tier's `diskGb` (the swap
slice is platform overhead, not their quota). Tier ratios are UNCHANGED — kept at ~12 GB/GB-RAM
(owner decision: already generous and sustainable under the 2×1TB-NVMe-per-128GB-RAM hardware ratio
of ~15.6, leaving headroom for OS/image layers/build caches/oversubscription).

## Scope / non-goals
- In scope: incus provider volume sizing (`createVolume` + `resizeVolume` in
  `packages/provider/src/incus/provider.ts`), a `swapReserveGb` helper in `packages/shared/src/tiers.ts`.
- Cloud (incus) ONLY. Self-host pods are Docker containers; swap is the host's concern and
  `provision-pod-base.sh` already excludes OSS — no change there (edition-parity).
- Not in scope: changing tier disk/RAM/CPU/price; changing swap size (stays `min(RAM,4G)`).

## Impact
- Users get the full disk their pod size promises. Per-pod NVMe use rises by `min(RAM,4G)` (2–8%);
  factor that into the per-box budget (disk is grow-only — plan for the high-water mark).
- Behavior change in the provider → update the relevant spec (sandbox-provider / live-provisioning)
  in the implementing commit; flip `skip_specs` off then.
