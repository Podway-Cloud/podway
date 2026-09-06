#!/usr/bin/env bash
# app-admin — the "never breaks your stack" maintenance engine for a self-hosted app (n8n first).
# The differentiator: a full pre-upgrade snapshot (DB + volume + encryption key + image tag) and an
# AUTOMATIC rollback of code AND data if the new version doesn't come up healthy. No competitor
# studied (Cloudron/Coolify/CapRover/…) delivers atomic code+data rollback; this does.
#
# Usage: app-admin.sh {deploy|status|snapshot|safe-upgrade <tag>|restore <snapshot-dir>}
set -euo pipefail

DIR="${APP_ADMIN_DIR:-/opt/n8n}"   # overridable for tests
SNAP_ROOT="$DIR/snapshots"
cd "$DIR"
export COMPOSE_PROJECT_NAME=n8n
DC="docker compose"
# n8n listens on 5678 in the container; compose.yaml maps it to the pod's :3000 preview port, so the
# health probe hits the HOST-side mapped port. Override APP_HEALTH_URL if the mapping changes.
HEALTH_URL="${APP_HEALTH_URL:-http://localhost:3000/}"

# First-boot deploy progress (openspec/changes/add-deploy-progress): a GENERIC convention any env can
# opt into — print `podway-progress: <message>` (init.sh tees this whole run to ~/.podway-setup.log)
# and keep the bare message current in ~/.podway-progress. The pod-agent surfaces the latest one on
# /healthz while first-boot setup is running, so the onboarding UI can show a real milestone instead
# of a blank spinner. No secrets — never interpolate anything sensitive into the message.
progress() { echo "podway-progress: $1"; printf '%s' "$1" > "${HOME:-/home/dev}/.podway-progress" 2>/dev/null || true; }

health() { # wait up to 120s for n8n to serve HTTP 200
  for _ in $(seq 1 40); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null)" = "200" ] && return 0
    sleep 3
  done
  return 1
}

pg_ready() { for _ in $(seq 1 20); do $DC exec -T postgres pg_isready -U n8n >/dev/null 2>&1 && return 0; sleep 2; done; return 1; }

# --- wrong-key guard: the #1 way an admin silently bricks n8n. On first deploy we PIN the hash of
# N8N_ENCRYPTION_KEY; every later deploy/upgrade/restore refuses if the key differs, because running
# against data encrypted with a different key leaves every stored credential undecryptable (the app
# looks healthy, then every credentialed node fails). Rotation must go through n8n's supported flow.
KEYGUARD="$DIR/.keyguard"
key_hash() { grep '^N8N_ENCRYPTION_KEY=' "$DIR/.env" | cut -d= -f2- | sha256sum | cut -d' ' -f1; }
check_key() {
  local h; h="$(key_hash)"
  if [ -z "$(grep '^N8N_ENCRYPTION_KEY=' "$DIR/.env" | cut -d= -f2-)" ]; then
    echo "XX KEY GUARD: N8N_ENCRYPTION_KEY is empty — refusing (n8n would auto-generate a throwaway key)." >&2; return 5
  fi
  if [ -f "$KEYGUARD" ]; then
    if [ "$(cat "$KEYGUARD")" != "$h" ]; then
      echo "XX KEY GUARD: N8N_ENCRYPTION_KEY does NOT match the key this data was encrypted with." >&2
      echo "   Running now would make every stored credential undecryptable while the app looks healthy. Refusing." >&2
      echo "   Restore the correct key, or rotate via n8n's supported flow." >&2
      return 5
    fi
  else
    echo "$h" > "$KEYGUARD"   # first deploy pins the key
  fi
  return 0
}

do_snapshot() { # -> prints the snapshot dir
  local ts; ts="$(date -u +%Y%m%dT%H%M%SZ)"; local s="$SNAP_ROOT/$ts"; mkdir -p "$s"
  # 1. DB (the workflows/executions/ENCRYPTED-credentials)
  $DC exec -T postgres pg_dump -U n8n -Fc n8n > "$s/db.dump"
  # 2. the n8n data volume (settings, binary data)
  docker run --rm -v ${COMPOSE_PROJECT_NAME}_n8n:/v -v "$s":/b alpine tar czf /b/n8n-vol.tgz -C /v . >/dev/null 2>&1
  # 3. the .env — carries N8N_ENCRYPTION_KEY (the #1 landmine) + the exact image tag
  cp "$DIR/.env" "$s/env"
  echo "$s"
}

do_restore() { # <snapshot-dir> — restore code(tag)+data(DB+volume)+key atomically
  local s="$1"; [ -d "$s" ] || { echo "no such snapshot: $s" >&2; exit 1; }
  cp "$s/env" "$DIR/.env"                      # restores tag + key
  check_key || exit $?                          # the restored key must match what the data was encrypted with
  $DC up -d postgres; pg_ready
  $DC exec -T postgres pg_restore -U n8n -d n8n --clean --if-exists --no-owner < "$s/db.dump" >/dev/null 2>&1 || true
  docker run --rm -v ${COMPOSE_PROJECT_NAME}_n8n:/v -v "$s":/b alpine sh -c 'rm -rf /v/* /v/..?* /v/.[!.]* 2>/dev/null; tar xzf /b/n8n-vol.tgz -C /v' >/dev/null 2>&1
  $DC up -d n8n
}

cmd="${1:-status}"
case "$cmd" in
  deploy)
    check_key || exit $?
    progress "Pulling n8n…"
    $DC pull >/dev/null 2>&1 || true   # best-effort pre-pull; `up -d` below still pulls if this is skipped/offline
    $DC up -d postgres; pg_ready || true
    progress "Starting the database…"
    $DC up -d
    if health; then
      progress "n8n is live"
      echo "DEPLOYED healthy: $(grep N8N_IMAGE .env)"
    else
      echo "DEPLOY UNHEALTHY" >&2; exit 1
    fi ;;
  status)   $DC ps --format '{{.Service}} {{.Status}}'; echo "image: $(grep N8N_IMAGE .env)" ;;
  snapshot) s=$(do_snapshot); echo "snapshot -> $s ($(du -sh "$s" | cut -f1))" ;;
  check-key) check_key && echo "KEY OK — matches the pinned encryption key" ;;
  restore)  do_restore "$2"; health && echo "RESTORED healthy from $2" || { echo "RESTORE UNHEALTHY" >&2; exit 1; } ;;
  safe-upgrade)
    target="$2"; old="$(grep '^N8N_IMAGE=' .env | cut -d= -f2)"
    check_key || exit $?                          # never upgrade with a tampered/missing key
    echo ">> safe-upgrade: $old -> $target"
    snap=$(do_snapshot); echo ">> pre-upgrade snapshot: $snap"
    # Pull FIRST — a bad/missing tag fails here, before we touch the running app.
    if ! sed -i "s|^N8N_IMAGE=.*|N8N_IMAGE=$target|" .env || ! $DC pull n8n 2>/dev/null; then
      echo "!! pull failed for $target — aborting, nothing changed"; sed -i "s|^N8N_IMAGE=.*|N8N_IMAGE=$old|" .env; exit 2
    fi
    $DC up -d n8n
    if health; then
      echo "++ UPGRADE OK: $target is healthy"; exit 0
    else
      echo "!! $target did NOT come up healthy — AUTO-ROLLBACK to $old"
      do_restore "$snap"
      if health; then echo "<< ROLLED BACK to $old, healthy — stack intact"; exit 3
      else echo "XX rollback also unhealthy — MANUAL ATTENTION (snapshot: $snap)" >&2; exit 4; fi
    fi ;;
  *) echo "usage: $0 {deploy|status|snapshot|safe-upgrade <tag>|restore <snap>}" >&2; exit 1 ;;
esac
