#!/usr/bin/env bash
# Regenerate selfhost/releases.json — the STATIC release manifest a self-host install fetches to
# learn what an update contains (release-versioning §4).
#
# The file is COMMITTED to this repo and carried to the public source mirror by scripts/oss-mirror.sh,
# so self-host reads it from raw.githubusercontent.com and NEVER calls podway.io. That independence is
# the whole point of decision 4.4 — do not "simplify" this into a live API call.
#
# Replaces the old scripts/publish-install-mirror.sh, retired 2026-09-06 when Podway-Cloud/install was
# folded into the source mirror (its copy had already drifted: it served 0.8.3 while 0.8.6 was current).
#
#   ADMIN_API_TOKEN=… scripts/update-selfhost-releases.sh   # then commit selfhost/releases.json
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/selfhost/releases.json"
WEB="${PODWAY_WEB_URL:-https://podway.io}"

if [ -z "${ADMIN_API_TOKEN:-}" ]; then
  echo "ADMIN_API_TOKEN unset — cannot regenerate. Fetch it from the podway-web Fly secret." >&2
  exit 1
fi

TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
echo "== generating releases.json from $WEB =="
curl -fsS -H "Authorization: Bearer $ADMIN_API_TOKEN" "$WEB/api/admin/images?releases=1" -o "$TMP"
python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$TMP"   # refuse to write malformed JSON
mv "$TMP" "$OUT"; trap - EXIT
echo "   $(grep -o '"version"' "$OUT" | wc -l) release(s) → selfhost/releases.json"
echo "   now COMMIT it; the OSS mirror publishes it on the next sync."
