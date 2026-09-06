#!/usr/bin/env bash
# One-time migration for an EXISTING self-host install created before the podbay→podway rename.
# Renames the compose project, DB, app volumes, network, and pod containers from podbay* to podway*.
#
# ⚠️ TESTED ONLY for the DB-rename SQL (unit-tested against Postgres). The Docker volume/container/
#    network mechanics have NOT been run on a live Docker host from this dev pod (it has no Docker).
#    RUN THIS ON A SCRATCH INSTALL FIRST, then your real install. Take a backup before running.
#
# Fresh installs need nothing — the new compose.yaml already provisions everything as podway*.
#
# Usage (from the install dir, after `git pull` to get the podway compose.yaml + app image):
#   bash migrate-podbay-to-podway.sh            # dry-run: prints what it would do
#   APPLY=1 bash migrate-podbay-to-podway.sh    # execute
set -euo pipefail
APPLY="${APPLY:-0}"
run() { echo "+ $*"; [ "$APPLY" = 1 ] && "$@"; }

echo "== 0. Preconditions =="
command -v docker >/dev/null || { echo "docker not found"; exit 1; }
if ! docker compose ls --all 2>/dev/null | awk '$1=="podbay"{f=1} END{exit !f}'; then
  echo "No 'podbay' compose project found — nothing to migrate (fresh installs are already podway)."; exit 0
fi

echo "== 1. Stop the stack (KEEP volumes) =="
run docker compose -p podbay down   # NO -v — volumes must survive

copy_volume() { # $1 old  $2 new
  docker volume inspect "$2" >/dev/null 2>&1 && { echo "  $2 exists — skip copy"; return; }
  run docker volume create "$2"
  run docker run --rm -v "$1":/from:ro -v "$2":/to alpine sh -c 'cp -a /from/. /to/'
}

echo "== 2. Copy app volumes podbay_* → podway_* =="
copy_volume podbay_pgdata  podway_pgdata
copy_volume podbay_appdata podway_appdata

echo "== 3. Copy each pod's home volume podbay-<id>-home → podway-<id>-home =="
for v in $(docker volume ls -q | grep -E '^podbay-.*-home$' || true); do
  copy_volume "$v" "$(echo "$v" | sed 's/^podbay-/podway-/')"
done

echo "== 4. Rename the database podbay → podway (on the copied pgdata) =="
# Bring a temp Postgres up on the NEW pgdata, rename, stop. No app connections while down.
if [ "$APPLY" = 1 ]; then
  cid=$(docker run -d -e POSTGRES_HOST_AUTH_METHOD=trust -v podway_pgdata:/var/lib/postgresql/data postgres:16)
  trap 'docker rm -f "$cid" >/dev/null 2>&1 || true' EXIT
  until docker exec "$cid" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
  docker exec "$cid" psql -U postgres -c 'ALTER DATABASE podbay RENAME TO podway;' || \
    echo "  (podway DB may already exist / already renamed — verify manually)"
  docker rm -f "$cid" >/dev/null; trap - EXIT
else
  echo "+ (temp postgres on podway_pgdata) ALTER DATABASE podbay RENAME TO podway;"
fi

echo "== 5. Recreate the pod network =="
run docker network create podway-pods 2>/dev/null || true

echo "== 6. Bring up the podway stack (new compose.yaml, project 'podway') =="
run docker compose -p podway up -d
echo "   The control plane re-provisions pod CONTAINERS with podway-<id> names + podway.* labels"
echo "   from the DB records, reattaching the copied podway-<id>-home volumes."

echo "== 7. VERIFY, then clean up the old podbay* resources =="
echo "   Open the dashboard, reconnect an existing pod, launch a new one. ONLY THEN:"
echo "   docker compose -p podbay rm -f; docker volume rm podbay_pgdata podbay_appdata \\"
echo "     \$(docker volume ls -q | grep '^podbay-.*-home$'); docker network rm podbay-pods"
echo "== done (APPLY=$APPLY) =="
