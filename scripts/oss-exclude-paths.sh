# OSS mirror exclude-list — the single source of truth for what NEVER leaves the private monorepo.
# Sourced by BOTH scripts/oss-mirror.sh (which subtracts these from the export) AND
# scripts/check-published-mirrors.sh (which treats a HEAD that is "ahead" ONLY in these paths as
# in-sync, not drift). Keep the two in lockstep by sharing ONE list — a copy in each script drifts.
#
# infra topology, ops, internal planning, secrets. Everything NOT here is published. Keep it SHORT
# and infra-only — when in doubt, a path is public. Refine during a dry-run.
EXCLUDES=(
  # infra topology — Fly app configs + fleet/deploy/box orchestration (the ops moat)
  "apps/web/fly.toml" "packages/gateway/fly.toml"
  "smoke/fly.toml" "scripts/db-backup"
  "scripts/deploy-app.sh" "scripts/incus"
  # ops runbooks reveal infra topology
  "docs/runbooks"
  # internal planning / GTM / business
  "0asks.md" "0audit.md" "docs/strategy" "docs/plans"
  # internal agent/dev-workflow instructions (reference prod DB, the box, deploy procedures)
  "CLAUDE.md" ".claude"
  # internal release + infra tooling (mirror scripts, DB migration between hosts)
  "scripts/migrate-db-neon-to-fly.sh" "scripts/publish-relay-mirror.sh"
  # PRIVATE workflows only — the deploy/build/mirror CI references managed infra. The public
  # lint/test workflow (.github/workflows/public-ci.yml) is NOT excluded — it ships to the mirror.
  ".github/workflows/ci.yml" ".github/workflows/selfhost-images.yml" ".github/workflows/oss-mirror.yml"
  ".github/workflows/relay-mirror.yml"
  # never mirror agent-internal + env files
  ".git" ".env" ".env.local" ".env.production"
)
