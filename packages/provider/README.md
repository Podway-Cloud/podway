# @podway/provider

Provider-agnostic pod lifecycle. A **pod** is one isolated compute instance + one persistent
volume, provisioned from a `ResolvedPod` (`@podway/shared`). The `SandboxProvider` interface
hides infrastructure; `FlyProvider` implements it over the Fly Machines API.

## Interface

```ts
interface SandboxProvider {
  createPod(input): Promise<PodInfo>;   // idempotent by pod id
  getPod(id): Promise<PodInfo>;          // status "gone" if absent
  listPods(filter?): Promise<PodInfo[]>;
  exec(id, command): Promise<ExecResult>;
  sleep(id): Promise<PodInfo>;           // suspend (RAM snapshot); refused if keepAwake
  wake(id): Promise<PodInfo>;
  setKeepAwake(id, bool): Promise<PodInfo>; // pin awake during Remote Control
  snapshot(id): Promise<{ snapshotId }>;    // volume snapshot
  destroy(id): Promise<void>;               // removes machine AND volume
  endpoint(id): Promise<string>;            // agent address for a running pod
}
```

## Model

- **One Incus instance per pod**, with its own home volume, on the box's `podbay` storage pool
  (that pool name is permanent — Incus has no `storage rename`). Self-host runs the same interface
  through `LocalProvider` (one Docker container per pod).
- **First-boot injection**: the provider injects `/etc/podway/pod-spec.json` and the
  environment's `.claude/` layer as guest files at create time. The base image's
  [`pod-base/init.sh`](./pod-base/init.sh) seeds config + the permission preset and runs `setup`
  once, guarded by a marker so wake never re-seeds. **No credentials are ever injected** — the
  user authenticates the CLI inside the pod.
- **Base-image entrypoint**: the image runs [`@podway/pod-agent`](../pod-agent), which calls
  `podway-init` (the seeding above) and then serves the terminal (PTY↔WebSocket + sidecar).
  `init.sh` remains the documented first-boot contract that pod-agent invokes.
- **Suspend/resume** are EXPLICIT owner verbs, never automatic. Pods run 24/7; the idle sweep
  that used to suspend them only ever applied to Fly pods and was deleted on 2026-09-04 with that
  provider. `keepAwake` remains as the flag that blocks a maintenance-driven stop.

## Incus setup (the live path)

The box is prepared by [`scripts/incus/bootstrap-box.sh`](../../scripts/incus/bootstrap-box.sh);
the pod base image is built and recorded by
[`scripts/incus/build-and-record.sh`](../../scripts/incus/build-and-record.sh). The control plane
reaches the box over WireGuard and needs `PODWAY_INCUS_URL`, `PODWAY_INCUS_CLIENT_CERT/KEY`,
`PODWAY_INCUS_POOL`, `PODWAY_INCUS_PROJECT` and `PODWAY_WG_CONF`.

There is no Fly path. `FlyProvider`, its config loader and its gated live e2e were deleted on
2026-09-04 — the `podbay-pods` app and its registry no longer exist, and no pod had been
`provider=fly` since the Incus pivot.

## Tests

`pnpm -F @podway/provider test` runs unit tests with in-memory fakes (no network).

## Known limitation (v0)

Fly has no per-machine egress allowlist like Anthropic's proxy. v0 records the environment's
network policy but does not fully enforce a custom allowlist; the allowlist proxy is a later
hardening change. Building pod images from a Dockerfile/devcontainer is also later — v0 boots a
prebuilt base image and injects config/setup at runtime.
