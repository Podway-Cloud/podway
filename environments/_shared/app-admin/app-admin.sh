#!/usr/bin/env bash
# app-admin — the shared "never breaks your stack" maintenance engine for a self-hosted app-pod.
# The differentiator: a full pre-upgrade snapshot (DB + data volumes + encryption key + image tag) and
# an AUTOMATIC rollback of code AND data if the new version doesn't come up healthy.
#
# This is the SHARED engine (environments/_shared/app-admin). It is app-agnostic: every app-specific
# value comes from `app.manifest` in $APP_ADMIN_DIR (sourced below). A new app writes compose.yaml + a
# manifest + a kickoff charter — NO changes here. n8n is the reference app (environments/n8n).
#
# Usage: app-admin.sh {deploy|status|snapshot|check-key|safe-upgrade <tag>|restore <snapshot-dir>}
set -euo pipefail

DIR="${APP_ADMIN_DIR:-$PWD}"   # the app dir (compose.yaml + .env + app.manifest live here); tests override
SNAP_ROOT="$DIR/snapshots"

# ── Per-app config (sourced) ──────────────────────────────────────────────────────────────────────
# app.manifest is a shell KEY=VALUE file. Fields (see docs/runbooks/app-authoring.md):
#   APP_PROJECT       compose project name (docker labels / volume prefix), e.g. n8n
#   APP_SERVICE       the app container service (deploy/pull/upgrade target), e.g. n8n
#   APP_IMAGE_VAR     the .env var holding the app's image tag (for safe-upgrade), e.g. N8N_IMAGE
#   APP_HEALTH_URL    health probe URL (default http://localhost:3000/)
#   DB_TYPE           postgres | mysql | none
#   DB_SERVICE/DB_USER/DB_NAME   the DB container + creds (when DB_TYPE != none)
#   APP_DATA_VOLUMES  space-separated named volumes to snapshot/restore via tar (project-prefixed), e.g. "n8n"
#   KEYGUARD_VAR      the encryption-key .env var to pin+guard; empty/unset = key-guard OFF
[ -f "$DIR/app.manifest" ] || { echo "app-admin: no app.manifest in $DIR" >&2; exit 1; }
# shellcheck disable=SC1091
. "$DIR/app.manifest"
: "${APP_PROJECT:?app.manifest must set APP_PROJECT}"
: "${APP_SERVICE:?app.manifest must set APP_SERVICE}"
: "${APP_IMAGE_VAR:?app.manifest must set APP_IMAGE_VAR}"
APP_HEALTH_URL="${APP_HEALTH_URL:-http://localhost:3000/}"
# How many 3s health probes to wait for the app to answer (default 40 = 120s). Slow first-boot apps
# (a heavy Java image downloading deps, say) set a higher APP_HEALTH_RETRIES in their app.manifest.
APP_HEALTH_RETRIES="${APP_HEALTH_RETRIES:-40}"
DB_TYPE="${DB_TYPE:-none}"
APP_DATA_VOLUMES="${APP_DATA_VOLUMES:-}"

cd "$DIR"
export COMPOSE_PROJECT_NAME="$APP_PROJECT"
DC="docker compose"

# First-boot deploy progress: print `podway-progress: <msg>` (init.sh tees setup to ~/.podway-setup.log)
# and keep the bare message in ~/.podway-progress so the pod-agent surfaces it on /healthz. No secrets.
progress() { echo "podway-progress: $1"; printf '%s' "$1" > "${HOME:-/home/dev}/.podway-progress" 2>/dev/null || true; }

health() { # wait up to 120s for the app to answer (any 2xx/3xx — a root that REDIRECTS to a
  # setup/login page, very common, is alive not broken; requiring exactly 200 rolled back good upgrades)
  for _ in $(seq 1 "$APP_HEALTH_RETRIES"); do
    case "$(curl -s -o /dev/null -w '%{http_code}' "$APP_HEALTH_URL" 2>/dev/null)" in 2??|3??) return 0 ;; esac
    sleep 3
  done
  return 1
}

# ── DB adapters (dispatch on DB_TYPE) ───────────────────────────────────────────────────────────────
db_ready() {
  case "$DB_TYPE" in
    none) return 0 ;;
    postgres) for _ in $(seq 1 20); do $DC exec -T "$DB_SERVICE" pg_isready -U "$DB_USER" >/dev/null 2>&1 && return 0; sleep 2; done; return 1 ;;
    mysql) for _ in $(seq 1 20); do $DC exec -T "$DB_SERVICE" mysqladmin ping -u"$DB_USER" >/dev/null 2>&1 && return 0; sleep 2; done; return 1 ;;
    *) echo "app-admin: unknown DB_TYPE '$DB_TYPE'" >&2; return 1 ;;
  esac
}
db_dump() { # -> writes the dump to $1
  case "$DB_TYPE" in
    none) : ;;
    postgres) $DC exec -T "$DB_SERVICE" pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$1" ;;
    mysql) $DC exec -T "$DB_SERVICE" sh -c "exec mysqldump -u$DB_USER $DB_NAME" > "$1" ;;
  esac
}
db_restore() { # <- restores from $1
  case "$DB_TYPE" in
    none) : ;;
    # Rebuild the database from scratch, then load the dump. `pg_restore --clean` dropped only objects
    # IN the dump, so tables/columns a failed release's migration ADDED survived the "rollback" — the app
    # looked healthy, then the next upgrade died on "already exists" (proved on Umami 3.1→3.3,
    # 2026-10-06). Errors are no longer swallowed: a failed restore must surface as MANUAL ATTENTION.
    postgres)
      $DC exec -T "$DB_SERVICE" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -q \
        -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$DB_NAME' and pid <> pg_backend_pid()" \
        -c "drop database if exists \"$DB_NAME\"" -c "create database \"$DB_NAME\" owner \"$DB_USER\"" >/dev/null || return 1
      $DC exec -T "$DB_SERVICE" pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --exit-on-error < "$1" >/dev/null || return 1 ;;
    mysql)
      $DC exec -T "$DB_SERVICE" sh -c "exec mysql -u$DB_USER -e 'drop database if exists \`$DB_NAME\`; create database \`$DB_NAME\`'" >/dev/null || return 1
      $DC exec -T "$DB_SERVICE" sh -c "exec mysql -u$DB_USER $DB_NAME" < "$1" >/dev/null || return 1 ;;
  esac
}

# ── Encryption-key guard (opt-in via KEYGUARD_VAR): the #1 way an admin silently bricks an app. First
# deploy PINS sha256(key); every later deploy/upgrade/restore refuses a changed/empty key, because
# running against data encrypted with a different key leaves stored credentials undecryptable. ────────
KEYGUARD="$DIR/.keyguard"
key_val() { grep "^${KEYGUARD_VAR}=" "$DIR/.env" 2>/dev/null | cut -d= -f2-; }
check_key() {
  [ -n "${KEYGUARD_VAR:-}" ] || return 0   # key-guard OFF for this app
  local v h; v="$(key_val)"; h="$(printf '%s' "$v" | sha256sum | cut -d' ' -f1)"
  if [ -z "$v" ]; then
    echo "XX KEY GUARD: ${KEYGUARD_VAR} is empty — refusing (the app would auto-generate a throwaway key)." >&2; return 5
  fi
  if [ -f "$KEYGUARD" ]; then
    if [ "$(cat "$KEYGUARD")" != "$h" ]; then
      echo "XX KEY GUARD: ${KEYGUARD_VAR} does NOT match the key this data was encrypted with." >&2
      echo "   Running now would make stored credentials undecryptable while the app looks healthy. Refusing." >&2
      return 5
    fi
  else
    echo "$h" > "$KEYGUARD"   # first deploy pins the key
  fi
  return 0
}

vol_tar() { # $1=action(save|load) $2=snapshot-dir : tar each APP_DATA_VOLUMES
  local vol
  for vol in $APP_DATA_VOLUMES; do
    local full="${COMPOSE_PROJECT_NAME}_${vol}"
    if [ "$1" = "save" ]; then
      docker run --rm -v "$full":/v -v "$2":/b alpine tar czf "/b/vol-$vol.tgz" -C /v . >/dev/null 2>&1
    else
      docker run --rm -v "$full":/v -v "$2":/b alpine sh -c "rm -rf /v/* /v/..?* /v/.[!.]* 2>/dev/null; tar xzf /b/vol-$vol.tgz -C /v" >/dev/null 2>&1
    fi
  done
}

do_snapshot() { # -> prints the snapshot dir
  # A NEW dir every time: two snapshots in the same second (e.g. the pre-restore save) used to land in
  # the SAME dir and silently overwrite the older one (2026-10-07). Append -2, -3 … on a clash.
  local ts s n=1; ts="$(date -u +%Y%m%dT%H%M%SZ)"; s="$SNAP_ROOT/$ts"; mkdir -p "$SNAP_ROOT"
  while ! mkdir "$s" 2>/dev/null; do n=$((n + 1)); s="$SNAP_ROOT/$ts-$n"; done
  [ "$DB_TYPE" = none ] || db_dump "$s/db.dump"
  vol_tar save "$s"
  cp "$DIR/.env" "$s/env"   # carries the encryption key + the exact image tag
  echo "$s"
}

do_restore() { # <snapshot-dir> — restore code(tag)+data(DB+volumes)+key atomically
  local s="$1"; [ -d "$s" ] || { echo "no such snapshot: $s" >&2; exit 1; }
  cp "$s/env" "$DIR/.env"; check_key || exit $?
  # Stop EVERY app container first: the failed release (and any sidecar on its image, e.g. Twenty's
  # worker) must not keep writing while its data is being replaced underneath it.
  $DC stop >/dev/null 2>&1 || true
  if [ "$DB_TYPE" != none ]; then
    $DC up -d "$DB_SERVICE" && db_ready || return 1
    if [ -f "$s/db.dump" ]; then db_restore "$s/db.dump" || { echo "!! database restore FAILED from $s/db.dump" >&2; return 1; }; fi
  fi
  vol_tar load "$s"
  $DC up -d   # all services, so a sidecar on the app image comes back on the OLD tag too
}

cmd="${1:-status}"
case "$cmd" in
  deploy)
    check_key || exit $?
    # Pull in the background and tick the progress line every 2s so a slow first-pull (an app image can
    # be hundreds of MB over the pod's egress) SHOWS movement instead of a frozen "Pulling…". Elapsed
    # seconds always advance; a parsed layer/percent from compose's output is appended when available.
    _pull_log="$(mktemp 2>/dev/null || echo /tmp/podway-pull.$$)"
    ( $DC pull > "$_pull_log" 2>&1 ) & _pull_pid=$!
    _pull_start=$(date +%s)
    while kill -0 "$_pull_pid" 2>/dev/null; do
      _el=$(( $(date +%s) - _pull_start ))
      _hint="$(grep -oE '[0-9]+(\.[0-9]+)?%|Downloading|Extracting|Pull complete|Waiting' "$_pull_log" 2>/dev/null | tail -1 || true)"
      progress "Pulling ${APP_SERVICE}… ${_el}s${_hint:+ · $_hint}"
      sleep 2
    done
    wait "$_pull_pid" 2>/dev/null || true
    rm -f "$_pull_log" 2>/dev/null || true
    if [ "$DB_TYPE" != none ]; then $DC up -d "$DB_SERVICE"; db_ready || true; progress "Starting the database…"; fi
    $DC up -d
    if health; then progress "${APP_SERVICE} is live"; echo "DEPLOYED healthy: $(grep "^${APP_IMAGE_VAR}=" .env)"; else echo "DEPLOY UNHEALTHY" >&2; exit 1; fi ;;
  status)   $DC ps --format '{{.Service}} {{.Status}}'; echo "image: $(grep "^${APP_IMAGE_VAR}=" .env)" ;;
  snapshot) s=$(do_snapshot); echo "snapshot -> $s ($(du -sh "$s" | cut -f1))" ;;
  check-key) check_key && echo "KEY OK" ;;
  restore)
    # On-demand restore (e.g. a QUIET break found days after an upgrade) goes back in time, so data
    # written since that snapshot would be lost. Save the CURRENT state first, so nothing is gone for
    # good and the owner can decide what to keep. (safe-upgrade's own rollback calls do_restore directly.)
    [ -n "${2:-}" ] && [ -d "$2" ] || { echo "usage: $0 restore <snapshot-dir> (see: ls $SNAP_ROOT)" >&2; exit 1; }
    pre=$(do_snapshot); echo ">> current state saved first: $pre"
    do_restore "$2" && health && echo "RESTORED healthy from $2 (the state before this restore is in $pre)" || { echo "RESTORE UNHEALTHY (the state before this restore is in $pre)" >&2; exit 1; } ;;
  safe-upgrade)
    target="$2"; old="$(grep "^${APP_IMAGE_VAR}=" .env | cut -d= -f2)"
    check_key || exit $?
    echo ">> safe-upgrade: $old -> $target"
    snap=$(do_snapshot); echo ">> pre-upgrade snapshot: $snap"
    if ! sed -i "s|^${APP_IMAGE_VAR}=.*|${APP_IMAGE_VAR}=$target|" .env || ! $DC pull "$APP_SERVICE" 2>/dev/null; then
      echo "!! pull failed for $target — aborting, nothing changed"; sed -i "s|^${APP_IMAGE_VAR}=.*|${APP_IMAGE_VAR}=$old|" .env; exit 2
    fi
    $DC up -d   # every service on the new tag (a sidecar sharing the image, e.g. Twenty's worker, too)
    if health; then echo "++ UPGRADE OK: $target is healthy"; exit 0
    else
      echo "!! $target did NOT come up healthy — AUTO-ROLLBACK to $old"
      if do_restore "$snap" && health; then echo "<< ROLLED BACK to $old, healthy — stack intact"; exit 3
      else echo "XX rollback also unhealthy — MANUAL ATTENTION (snapshot: $snap)" >&2; exit 4; fi
    fi ;;
  *) echo "usage: $0 {deploy|status|snapshot|check-key|safe-upgrade <tag>|restore <snap>}" >&2; exit 1 ;;
esac
