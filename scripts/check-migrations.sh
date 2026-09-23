#!/usr/bin/env bash
# Pre-deploy guard: does prod still owe any DB migration the repo has?
#
# The web image is a pruned Next standalone that CANNOT run migrations — only the gateway does, via
# its Fly release_command. So a web deploy that depends on a not-yet-applied migration ships broken
# (prod broke exactly this way on 0039: web selected pods.cpus/memory_mb before the column existed).
# This runs `migrate-prod --check` (read-only) against the prod DB and exits NONZERO if anything is
# pending, so deploy-app.sh can refuse `web` until `gateway` has been deployed first.
#
# Connectivity: prod DB is managed Neon (migrated 2026-09-23) — a PUBLIC TLS endpoint reachable
# directly from the pod. So we read DATABASE_URL from the gateway's env (never printed) and use it
# AS-IS: no `fly proxy` tunnel, no host rewrite (that was for the old Fly-internal podway-db). Needs
# `fly` + the built packages/db/dist/migrate-prod.js. Emergency override lives in deploy-app.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

GWAPP="${PODWAY_GATEWAY_APP:-podway-gateway}"

command -v fly >/dev/null 2>&1 || { echo "check-migrations: 'fly' not found — cannot reach prod DB" >&2; exit 1; }
[ -f packages/db/dist/migrate-prod.js ] || { echo "check-migrations: build @podway/db first (pnpm --filter @podway/db build)" >&2; exit 1; }

# The prod DATABASE_URL (managed Neon) — from the gateway env, or an explicit override for a
# non-Fly context. Keep it in a var; never echo it.
DBURL="${PODWAY_MIGRATION_CHECK_URL:-$(fly ssh console -a "$GWAPP" -C 'printenv DATABASE_URL' 2>/dev/null | grep -oE 'postgres[^[:space:]]+' | head -1 || true)}"
[ -n "$DBURL" ] || { echo "check-migrations: could not read DATABASE_URL from $GWAPP" >&2; exit 1; }

# migrate-prod --check: prints "up to date" (exit 0) or the pending list (exit 2). Neon is reached
# over TLS with the URL as-is (its sslmode/channel_binding params are already correct).
DATABASE_URL="$DBURL" node packages/db/dist/migrate-prod.js --check
