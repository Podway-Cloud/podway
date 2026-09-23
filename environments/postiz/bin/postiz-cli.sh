#!/usr/bin/env bash
# postiz-cli.sh — steer THIS pod's own Postiz from the agent, via the official `postiz` CLI.
#
# It does three things so the agent never has to click the Postiz UI to post:
#   1. lazy-installs the `postiz` CLI (npm) into ~/.postiz-cli on first use;
#   2. auto-mints a Public API key from the pod's OWN Postiz DB — Postiz stores the key in plaintext
#      on Organization.apiKey and its public-api middleware looks the raw key up there, so writing a
#      random string into that column IS a valid key (no UI, no hashing);
#   3. runs the CLI pointed at the local Postiz (http://localhost:3000, which serves /public/v1).
#
# The one thing it CANNOT do for the owner: create the account. Postiz has its own login, and an
# Organization (hence a key) only exists AFTER the owner registers in the Postiz UI. Until then this
# exits 3 with a clear message. After that: zero owner steps.
#
# Usage:
#   bin/postiz-cli.sh ensure                 # install CLI + mint/store the key (idempotent)
#   bin/postiz-cli.sh integrations:list      # any postiz subcommand, run against this pod's Postiz
#   bin/postiz-cli.sh posts:create ...       # schedule a post, etc.
set -euo pipefail
cd "${APP_ADMIN_DIR:-$HOME/work}"

CLI_HOME="$HOME/.postiz-cli"
CLI_BIN="$CLI_HOME/node_modules/.bin/postiz"
ENV_FILE="$PWD/.env"
# The pod's Postiz nginx serves the app on :3000 (compose maps internal 5000 → 3000) and proxies the
# backend under /api — so the public API base is http://localhost:3000/api (the CLI then appends
# /public/v1). Confirmed against the running stack: /api/public/v1 reaches the backend. Overridable for tests.
API_URL="${POSTIZ_API_URL:-http://localhost:3000/api}"
# DB coords match environments/postiz/app.manifest (DB_SERVICE/DB_USER/DB_NAME).
DB_SERVICE="${POSTIZ_DB_SERVICE:-postiz-postgres}"
DB_USER="${POSTIZ_DB_USER:-postiz}"
DB_NAME="${POSTIZ_DB_NAME:-postiz}"

log() { echo "postiz-cli: $*" >&2; }

ensure_cli() {
  [ -x "$CLI_BIN" ] && return 0
  log "installing the postiz CLI (one time, needs egress)…"
  mkdir -p "$CLI_HOME"
  npm install --no-audit --no-fund --prefix "$CLI_HOME" postiz@2 >/dev/null 2>&1 \
    || { log "npm install postiz failed — check egress"; exit 1; }
}

# Run one SQL statement inside the postgres container; print raw tab-separated rows.
psql_q() { docker compose exec -T "$DB_SERVICE" psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1"; }

ensure_key() {
  # Already stored? nothing to do.
  if grep -q '^POSTIZ_API_KEY=' "$ENV_FILE" 2>/dev/null; then return 0; fi
  local orgid key
  orgid="$(psql_q 'SELECT id FROM "Organization" LIMIT 1;' 2>/dev/null | head -1 | tr -d '[:space:]')" \
    || { log "cannot reach the Postiz DB — is the stack up? try: APP_ADMIN_DIR=~/work bin/app-admin.sh status"; exit 1; }
  if [ -z "$orgid" ]; then
    log "no Postiz organization yet — the owner must REGISTER an account in the Postiz UI first, then re-run."
    exit 3
  fi
  key="$(psql_q "SELECT COALESCE(\"apiKey\",'') FROM \"Organization\" WHERE id='$orgid';" | head -1 | tr -d '[:space:]')"
  if [ -z "$key" ]; then
    key="$(openssl rand -hex 24)"
    psql_q "UPDATE \"Organization\" SET \"apiKey\"='$key' WHERE id='$orgid';" >/dev/null
    log "minted a fresh Public API key for org $orgid"
  else
    log "reusing the org's existing Public API key"
  fi
  printf 'POSTIZ_API_KEY=%s\n' "$key" >> "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

load_key() { grep '^POSTIZ_API_KEY=' "$ENV_FILE" | tail -1 | cut -d= -f2-; }

case "${1:-}" in
  ensure)
    ensure_cli; ensure_key
    log "ready — POSTIZ_API_URL=$API_URL, key stored in .env. Try: bin/postiz-cli.sh integrations:list"
    exit 0 ;;
  "")
    echo "usage: bin/postiz-cli.sh <ensure | <postiz-subcommand>...>   e.g. bin/postiz-cli.sh integrations:list" >&2
    exit 2 ;;
esac

ensure_cli
ensure_key
export POSTIZ_API_KEY="$(load_key)" POSTIZ_API_URL="$API_URL"
exec "$CLI_BIN" "$@"
