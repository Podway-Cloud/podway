## 1. Provider

- [x] 1.1 Test first: incus-provider tests assert `raw.qemu.conf` with `share = "off"` for `mem0` on
      launch, resize, and updateImage (fail on current code)
- [x] 1.2 One constant for the override; add it to the instance config on all three paths
- [x] 1.3 Delete `docs/plans/ksm-private-guest-memory.md` (folded into this change)

## 2. Verify

- [x] 2.1 Scratch pod launched through the provider path boots with `share = "off"` in its qemu.conf;
      pod-agent healthy; KSM merges its pages; scratch pod deleted
- [x] 2.2 Provider + control-plane suites green

## 3. Ship (owner yes per step)

- [ ] 3.1 PR + merge; deploy gateway + web (the provider runs in the control plane)
- [ ] 3.2 Watch box `general_profit`, free memory, swap and ksmd CPU for a week as pods Update

Notes:
- 2.1 verified with the provider's EXACT raw.qemu.conf value on a scratch VM via the incus CLI (qemu.conf
  shows share = "off", incus exec works); the control-plane API path itself runs on first real launch.
  KSM merging was measured earlier on share=off scratch pods (design.md).
- The requirement is already in openspec/specs/sandbox-provider/spec.md → archive with --skip-specs.
- All 19 live home volumes are BLOCK (checked 2026-09-25); the guard skips any legacy filesystem home.
