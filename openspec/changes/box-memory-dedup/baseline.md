# Whole-box baseline (before any change)

```
2026-09-30T22:36:53Z
MemFree: 22.8 GiB
MemAvailable: 27.3 GiB
Cached: 70.0 GiB
SwapTotal: 8.0 GiB
SwapFree: 2.8 GiB
AnonPages: 1.9 GiB
Shmem: 67.3 GiB
arc_hits 2349035773
arc_misses 31359482
arc_c_max 62.8568
arc_size 23.8287
ksm_pages_sharing 36755 ksm_full_scans 656349
ksmd_cpu_s 18939.6
vm cheerful-donkey-6bc4 rss=4.2 anon=0.1
vm christian-dormouse-68b4 rss=1.9 anon=0.1
vm convenient-quail-8b79 rss=4.0 anon=0.1
vm critical-hornet-4bc3 rss=2.7 anon=0.0
vm dual-bear-fb14 rss=7.2 anon=0.1
vm enthusiastic-vulture-4ce0 rss=8.0 anon=0.1
vm everyday-harrier-ae1b rss=5.9 anon=0.1
vm gastric-turtle-388b rss=0.7 anon=0.0
vm icy-hare-19dc rss=1.9 anon=0.1
vm moderate-peacock-59a7 rss=2.2 anon=0.1
vm nursing-gull-2e54 rss=16.0 anon=0.1
vm only-mackerel-1349 rss=0.7 anon=0.0
vm partial-canidae-a766 rss=2.4 anon=0.1
vm public-perch-94af rss=1.7 anon=0.1
vm secondary-aphid-b000 rss=0.7 anon=0.0
vm valuable-meadowlark-f958 rss=4.1 anon=0.1
vm voluntary-falcon-e754 rss=4.1 anon=0.1
```

## Log
- 22:40Z `primarycache=metadata` on podbay/custom (17 home volumes inherit; images + VMs stay `all`). ARC cap 32 GiB.
- 22:45Z test:1 + test:2 on `memory-backend-ram` (merge on): 0 memfd maps, RSS = Anonymous, /healthz OK.
  test:1 needed a forced stop (graceful stop timed out after 60 s).
- ~00:40Z test:1 reclaim via watcher (MODE=on, others excluded): guest file cache 2.7 -> 1.1 GiB, host RSS
  3.95 -> 2.98 GiB in 45 s, /healthz OK. Dry run on the fleet picks makore.app prod first, skips podway dev.
- ~00:47Z watcher installed on the box in dryrun (timer 60 s).
- 00:41Z after 2 h: KSM pages_sharing 36,755 -> 265,290 (+0.87 GiB merged, from the two 4 GiB test pods
  alone; ksmd +237 CPU-s). Test pods: RSS = Anonymous (2.0 / 1.8 GiB), no memfd, no doubling.
  ARC 23.8 -> 21.9 GiB; window hit rate 93.5% (lifetime 98.7%; homes now miss to NVMe, ~69 misses/s).
  Whole box MemAvailable 27.3 -> 24.2 GiB, driven by makore.app dev +6.6 GiB (next-server build), not the pilot.
  Watcher dry run fired once (00:13Z, MemAvailable 10 GiB): would have taken cache from the biggest holders.
- 00:42Z ARC cap 16 GiB live + /etc/modprobe.d/zfs.conf: ARC 21.9 -> 15.5 GiB, MemAvailable 24.2 -> 30.2 GiB.
  Reboot persistence not yet observed.
