# Tasks — allocate pod swap on TOP of the disk quota

## 1. Sizing helper
- [ ] 1.1 Add `swapReserveGb(size)` = `min(memoryGb, 4)` in `packages/shared/src/tiers.ts` (single source; matches provision-pod-base's `min(RAM,4G)`).

## 2. Provider volume sizing
- [ ] 2.1 `createVolume` (`packages/provider/src/incus/provider.ts:334`): provision `diskGb + swapReserveGb` instead of `diskGb`.
- [ ] 2.2 `resizeVolume` (`:558`): same addend; preserve grow-only (`max(diskGb, tier.diskGb) + swapReserveGb`).
- [ ] 2.3 Confirm nothing else treats the volume size as the user's quota (dashboard/df copy) — the user-facing number stays `diskGb`, the swap slice is overhead.

## 3. Edition parity
- [ ] 3.1 Verify OSS/LocalProvider is untouched (Docker container; swap is the host's concern; provision-pod-base already excludes OSS). No self-host regression.

## 4. Verify
- [ ] 4.1 Launch/resize a cloud pod of a known tier; assert `df /home/dev` total ≈ `tier.diskGb` USABLE after the swapfile exists (i.e. total ≈ diskGb + swap, usable ≈ diskGb).
- [ ] 4.2 Resize up then down; confirm grow-only high-water + swap addend both hold.

## 5. Spec + ship
- [ ] 5.1 Update the provider volume-sizing behavior in `openspec/specs/sandbox-provider` (or `live-provisioning`) in the SAME commit; flip `.openspec.yaml skip_specs` off.
- [ ] 5.2 Build + test (`pnpm -r build && pnpm -r test`, provider suite); ship (provider is deployed in web+gateway images — no pod-base build needed for the volume-sizing change; new pods get the bigger volume, existing pods get it on their next resize).
