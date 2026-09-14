## 1. Extract the shared app-admin engine (n8n-first, prove parity)

- [x] 1.1 Define the per-app manifest format (health URL + port, compose path, container names, volume
      names, DB dump/restore commands, key-guard on/off + key env var, image-pin var). Verify: it
      expresses everything n8n's `bin/app-admin.sh` currently hard-codes — nothing app-specific is left
      in the engine.
- [x] 1.2 Create `environments/_shared/app-admin/` — the engine (`deploy|status|snapshot|safe-upgrade|
      restore|check-key`) generalized from n8n's script, reading the manifest; `APP_ADMIN_DIR`-overridable.
      Verify: `shellcheck` clean; each command is pure behavior over the manifest.
- [x] 1.3 Migrate `environments/n8n/` onto the shared engine (n8n keeps only `compose.yaml` + its
      manifest + `kickoff`; its `bin/app-admin.sh` becomes a thin call into `_shared/app-admin`).
      Verify: `environments-conform` test passes; the command surface is config-only vs the old script.

## 2. Unit-test the engine's decision logic (CI, no Docker)

- [x] 2.1 Add pure tests for the engine's decisions — key-guard (match / mismatch / empty → refuse),
      tag rewrite, and "unhealthy ⇒ rollback" trigger — using `APP_ADMIN_DIR` + a mocked `docker`.
      Verify: tests pass in CI with no Docker; a deliberately-wrong encryption key is refused.

## 3. Per-app minimum size

- [x] 3.1 Add optional `minSize` to `EnvironmentSchema` (`packages/shared/src/schema.ts`) and thread it
      through `resolve.ts` → `apps/web/lib/environments.ts`. Verify: `@podway/shared` build + the
      environments-conform test pass; an unknown size value fails validation, an omitted one is valid.
- [x] 3.2 Honor `minSize` in the launch size picker (default to at least it, prevent below-floor), and
      set n8n's `minSize` to its estimated floor. Verify: a web test asserts the picker floors to
      `minSize` and blocks a below-floor launch.

## 4. Cloud-only gate on kind:app

- [x] 4.1 Gate the Apps tab + `kind: app` tiles behind `!editionOss()` (env-gallery / env-tabs).
      Verify: a test asserts no Apps tab / no app tiles render under `editionOss()`.
- [x] 4.2 Refuse `kind: app` at launch when `editionOss()`. Verify: a test asserts launching a
      `kind: app` env under `editionOss()` is refused with a clear reason.

## 5. Real-infra smoke harness

- [x] 5.1 Write the scratch-pod app smoke harness (launch from pod-base → stage env into `~/work` →
      wait for setup-done → assert `app-admin status` + `curl :3000`=200 → `incus restart` → re-assert →
      simulate image-update (purge Docker) → re-assert data survives → `safe-upgrade` a bad tag →
      assert auto-rollback → destroy the pod), driven by the agent-ops scratch-pod recipe. Verify: a
      run against n8n passes every stage and the scratch pod + volume are destroyed after.
- [ ] 5.2 Run n8n's full smoke on the shared engine as the parity gate. Verify: n8n on `_shared/app-admin`
      passes deploy / restart-survival / image-update-survival / bad-tag auto-rollback.

## 6. Authoring runbook + spec sync

- [x] 6.1 Write `docs/runbooks/app-authoring.md` — the ordered checklist to add an app (pick → compose →
      manifest → kickoff admin charter → minSize → smoke test → verify on a scratch pod), with n8n as
      the worked example and links to the shared engine. Verify: following it, a new app requires only
      compose + manifest + kickoff + minSize — no engine code.
- [ ] 6.2 Sync the three delta specs into `openspec/specs/` (new `self-host-apps`; modified
      `environment-spec` + `launch-config`) and `openspec validate` each. Verify: all three validate.

## 7. Ship

- [ ] 7.1 Build + test (shared, web `tsc` + unit, the n8n smoke on a scratch pod), leak-scan staged
      diff, commit signed, open a PR; on CI green + owner go, merge. If the shared engine must be baked
      into the pod-base image, rebuild + bump the digest. Verify: required CI checks green; n8n stays
      one-click-launchable and healthy after merge.
