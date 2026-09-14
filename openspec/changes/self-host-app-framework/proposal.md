## Why

The n8n env proved the "app" pattern end-to-end on real infra: deploy and maintain a self-host OSS
service inside a pod, with its data surviving both a plain restart and an image-update. But that
pattern lives only in n8n's hand-written files — the maintenance engine is copy-paste, no env can
declare a size floor, there is no automated smoke test, no authoring guide, and no guard against
launching a docker-compose app on the self-host edition where it cannot run. Adding the next app
(Ghost, Cal.com, Metabase, …) today means re-deriving all of it. This change turns the proven n8n
pattern into a repeatable framework, so a new app is a thin config plus one verification pass.

## What Changes

- Extract n8n's `bin/app-admin.sh` into a **shared `environments/_shared/app-admin` engine** —
  `deploy` / `status` / `snapshot` / `safe-upgrade` (health-probe + auto-rollback of code AND data) /
  `restore` / encryption-key-guard — parameterized by a small per-app manifest (health URL, container
  + volume names, DB dump command, key-guard on/off, image pin). Each app supplies config, not code.
- Add an optional **`minSize` field** to the environment schema; the launch size picker honors it
  (defaults the pod up to at least the env's floor). Additive/optional — not breaking.
- Add a **reusable app-env smoke-test harness**: launch on a scratch pod → wait for setup-done →
  assert the stack is healthy (HTTP 200 on the preview port) → restart survives → image-update
  survives (data intact) → a bad-tag `safe-upgrade` auto-rolls-back — plus unit tests for the shared
  `app-admin` engine (which has zero tests today).
- Add **`docs/runbooks/app-authoring.md`** — the ordered checklist to add an app (pick → compose →
  app manifest → kickoff admin charter → size → smoke test → verify on a scratch pod).
- **Gate `kind: app` as cloud-only** — refuse to launch, and hide from the catalog, on the self-host
  (OSS) edition, where docker-in-docker is unavailable.
- Migrate the existing **n8n** env onto the shared engine, proving the extraction (behavior identical).

Non-goals for THIS change (later phases): the `/admin/apps` tracking page (app/version/last-backup/
issues registry), and authoring the actual next apps beyond n8n.

## Capabilities

### New Capabilities
- `self-host-apps`: how Podway deploys and maintains a self-host OSS app in a pod — the app-env
  contract (compose + per-app manifest + kickoff admin charter), the shared maintenance engine
  (deploy / snapshot / safe-upgrade-with-auto-rollback / restore / key-guard), the persistence
  guarantee (data on the home volume survives restart AND image-update), the cloud-only constraint,
  and the requirement that every app env ship a passing smoke test before it enters the catalog.

### Modified Capabilities
- `environment-spec`: an environment definition MAY declare a minimum/recommended pod size (`minSize`).
- `launch-config`: the launch size picker SHALL honor an environment's declared minimum size.

## Impact

- `packages/shared/src/schema.ts` — new optional `minSize` field on `EnvironmentSchema`.
- `environments/_shared/app-admin/` — new shared maintenance engine (extracted + generalized from
  n8n's `bin/app-admin.sh`), driven by a per-app manifest.
- `environments/n8n/` — migrated onto the shared engine (config-only; behavior unchanged).
- `apps/web` launch/picker — honor `minSize`; env-gallery + launch gate `kind: app` on `!editionOss()`.
- New app-env smoke-test harness (scratch-pod driven) + `app-admin` unit tests.
- `docs/runbooks/app-authoring.md` — the authoring checklist.
- Edition: cloud/Incus only. Self-host is unaffected (apps hidden + refused there); the existing
  edition note in the Dockerfile / provision script is the precedent.
