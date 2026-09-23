# Tasks — allocate pod swap on TOP of the disk quota

## 1. Sizing helper
- [x] 1.1 Added `swapReserveGb(memoryGb) = min(memoryGb, 4)` in `packages/shared/src/tiers.ts` (mirrors provision-pod-base's `min(RAM,4G)`).

## 2. Provider volume sizing
- [x] 2.1 `createVolume` (`incus/provider.ts`): provision `diskGb + swapReserveGb(memoryGb)`.
- [x] 2.2 `resizeVolume`: `max(current, diskGb + swapReserveGb(memoryGb))` — grow-only (block volume can't shrink; RAM-down keeps the larger volume). `getVolume` now returns `config.size` so the provider can read the current size.
- [x] 2.3 User-facing number is unchanged: `diskGb` stays the quota; the swap slice is volume overhead (the owner keeps `diskGb` usable).

## 3. Edition parity
- [x] 3.1 OSS/LocalProvider untouched — the helper is used only in the Incus provider; `provision-pod-base.sh` already excludes OSS (swap is the Docker host's concern).

## 4. Verify
- [x] 4.1 Unit-tested volume sizing across tiers (Mini 12→13, XL 180→184; per-pod tier create → 44). Live `df` check on a real pod pending the deploy (5.2).
- [x] 4.2 Grow-only proven: resize XL down to 1G RAM keeps the volume at 184 (not 181); resize disk up → 204. `test/incus-provider.test.ts`.

## 5. Spec + ship
- [x] 5.1 Spec updated inline: `openspec/specs/sandbox-provider/spec.md` — "Swap is provisioned on top of the disk quota" (create + grow-only scenarios).
- [x] 5.1a Build + tests green (`@podway/shared` built; provider incus/http-client/codex-prune suites pass).
- [ ] 5.2 SHIP: the Incus provider runs in the web process → this needs a **web deploy** (🔴, owner yes). New pods get the bigger volume; existing pods get it on their next resize. Then do the live `df` check.
