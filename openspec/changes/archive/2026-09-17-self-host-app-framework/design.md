## Context

See proposal.md for motivation. The proven seams the design builds on (from the machinery inventory):

- `environments/n8n/bin/app-admin.sh` — the maintenance engine: `deploy|status|snapshot|safe-upgrade|
  restore|check-key`, `APP_ADMIN_DIR`-overridable, health-probes `localhost:3000`, emits
  `podway-progress:` milestones the pod-agent surfaces on `/healthz`. This is what gets extracted.
- `environments/n8n/podway.yaml` — `setup[]` runs at FIRST boot only, as `dev`, in `~/work`
  (`init.sh` marker-guarded); `kickoff` becomes the agent's opening system-prompt charter
  (`boot.ts` `--append-system-prompt-file`). No `startup:` field exists — n8n survives boot via
  compose `restart: unless-stopped`.
- Docker is baked into the Incus pod-base by `scripts/incus/provision-pod-base.sh` with
  `data-root=/home/dev/.docker-data` (on the persistent home volume → container data survives an
  image-update). The OCI/self-host Dockerfile deliberately has no Docker (docker-in-docker fails).
- `packages/shared/src/schema.ts` `EnvironmentSchema` — no per-env size field today; sizes live in
  `packages/shared/src/tiers.ts` (`POD_TIERS`, `DEFAULT_POD_SIZE`). `editionOss()` is the cloud/OSS split.
- Env test surface today: schema-conformance only (`environments-conform.test.ts`); `app-admin.sh`
  has ZERO tests; n8n's persistence was proven manually on a scratch pod.

## Goals / Non-Goals

**Goals:** a shared config-driven maintenance engine; an optional `minSize` env field honored by the
picker; a scratch-pod smoke harness + pure unit tests for the engine's decision logic; an
app-authoring runbook; a cloud-only gate on `kind: app`; n8n migrated onto the shared engine as the
parity proof.

**Non-Goals:** the `/admin/apps` tracking page (later phase); authoring apps beyond n8n; a declarative
`startup:` env field (compose `restart` covers it); running apps on the self-host edition.

## Decisions

1. **Shared engine as an env `_shared` layer, not a pod-agent CLI.** Put the engine at
   `environments/_shared/app-admin/` (a script + lib). An app env's `setup` invokes it with a per-app
   manifest. Rationale: `_shared/*` layers already ship WITH the env (assembled by `init.sh`), so the
   engine iterates at env cadence, not the pod-image/pod-agent release cadence. *Alternative — bake it
   into the pod-agent binary:* rejected; couples app logic to image rebuilds and the agent release.

2. **Per-app manifest = the only per-app surface.** A small declarative file (health URL + port,
   compose path, container names, volume names, DB dump/restore commands, key-guard on/off + key env
   var, image-pin var). The shared engine is pure behavior over these fields; a new app writes
   `compose.yaml` + this manifest + a `kickoff` charter — no script logic.

3. **`minSize` is additive + optional.** Add `minSize?: PodSize` to `EnvironmentSchema`, thread it
   through `resolve` to the launch action; the picker starts at `max(globalDefault, env.minSize)` and
   blocks below. Absent ⇒ identical to today. Still subject to the account RAM budget
   (`assertRamFits`) — `minSize` only raises the default, never bypasses the budget.

4. **Cloud-only gate at two points.** (a) env-gallery: guard the Apps tab + `kind: app` tiles behind
   `!editionOss()` so self-host never shows them. (b) the launch action: refuse `kind: app` when
   `editionOss()`. Precedent: the existing edition note in the Dockerfile/provision script.

5. **Two-tier testing.** (a) PURE unit tests for the engine's decisions — key-guard match/reject,
   tag rewrite, "unhealthy ⇒ rollback" trigger — runnable in CI without Docker (`APP_ADMIN_DIR`
   override; bats or a node harness). (b) A real-infra SMOKE harness driven by the agent-ops
   scratch-pod recipe: launch a scratch pod from pod-base → stage the app env into `~/work` → wait for
   setup-done → assert `app-admin status` + `curl :3000`=200 → `incus restart` → re-assert →
   simulate image-update (purge Docker, per the n8n proof) → re-assert data survives → `safe-upgrade`
   a bad tag → assert auto-rollback → destroy the pod. On-demand/gated (needs box access), NOT the CI
   fake stack — apps need real Docker.

6. **Migrate n8n first, prove parity, then generalize.** Rewrite n8n's `app-admin.sh` to source the
   shared engine + its manifest with behavior unchanged, and run n8n's smoke test to confirm parity
   BEFORE the framework is considered done. This de-risks the extraction.

## Risks / Trade-offs

- **Smoke test isn't in standard CI** (needs real Docker + a scratch pod). Mitigation: the pure
  unit tests guard the engine's logic in CI; the full smoke gates shipping a *new* app.
- **Extraction drift** — a generalized engine could subtly differ from the proven n8n script.
  Mitigation: n8n-first migration + its smoke test as the parity gate.
- **`minSize` vs the RAM budget** — a large floor plus a full account could make an app unlaunchable.
  Acceptable: the budget already governs this; the picker explains it.
- **Manifest expressiveness** — the first non-n8n apps (Ghost/Cal.com) may need fields n8n didn't.
  Mitigation: extend the manifest as real apps demand it, rather than speculating now.
