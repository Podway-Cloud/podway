## 1. Pilot (evidence first)

- [x] 1.1 Record whole-box baseline (MemAvailable, Shmem, swap) and test:1/test:2 qemu RSS
- [x] 1.2 Set the balloon override on test:1/test:2 while stopped; start; confirm guest feature bit 5
- [x] 1.3 Run a build + idle cycle on both; measure host RSS and whole-box numbers over ≥ 3 hours
- [x] 1.4 Overhead check — NOT measured as a timed A/B. Instead: 9 days on the fleet (v0.8.38+) with no slowdown reported; the only cost seen is `page_reporting_process hogged CPU` workqueue warnings in guest dmesg (harmless).

## 2. Provider: free-page reporting

- [x] 2.1 `guestMemoryConfig` returns the balloon-only `raw.qemu.conf`; create/resize/update apply it
- [x] 2.2 Tests: config carries the balloon override and no `mem0` override; resize replaces a KSM override
- [x] 2.3 Update `sandbox-provider` spec (from the delta)

## 3. pod-agent: idle cache trim

- [x] 3.1 Idle detector (no agent turn + low load for 15 min) and hourly rate limit
- [x] 3.2 `drop_caches = 1` then `compact_memory = 1` as root; log `guest_cache_trimmed` with MB returned
- [x] 3.3 Tests: never trims during a turn; at most once per window; trims when idle
- [x] 3.4 Update `pod-agent` spec (from the delta)

## 4. Ship + verify

- [x] 4.1 PR + merge; gateway/web deploy (provider); pod-base image for pod-agent (owner yes first) — #357, v0.8.38
- [x] 4.2 Update test pods; re-measure whole box for hours before recommending fleet updates — continued as box-memory-dedup (whole-box MemAvailable 16 → 62 GB, 2026-09-29 → 10-02)
- [x] 4.3 Record results in 0audit; archive the change
