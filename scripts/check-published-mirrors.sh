#!/usr/bin/env bash
# Fail when a PUBLISHED artifact has drifted from this repo's source.
#
# Why this exists: a green grep and a successful push are evidence about the REPO only. Both public
# mirrors drifted precisely because publishing them was a MANUAL step nobody re-ran — the relay
# mirror sat on the old product name after the rename, and the install mirror served releases.json
# at 0.8.3 while 0.8.6 was current. Neither was noticed by CI, because CI never looked at what was
# actually published.
#
# Checks (read-only, no auth needed — everything here is public):
#   1. @podway/relay on npm matches packages/relay/package.json version.
#   2. podway-cloud/relay mirror serves the same package.json version.
#   3. podway-cloud/podway mirror serves selfhost/install.sh identical to ours.
#
#   scripts/check-published-mirrors.sh          # exit 1 on any drift
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0
note() { printf '  %s\n' "$*"; }
bad()  { printf '  DRIFT: %s\n' "$*" >&2; FAIL=1; }

# Read published files through the API, NOT raw.githubusercontent.com.
#
# The raw host sits behind a CDN that serves a stale copy for minutes after a push, so a raw read
# reports DRIFT against content that is already correct — a false alarm that trains people to ignore
# this check, which is worse than not having it. Observed 2026-09-06: raw served the pre-merge
# install.sh while the API already had the merged one. `Accept: vnd.github.raw` returns file bytes.
fetch() { curl -fsSL --max-time 30 "$1" 2>/dev/null; }
fetch_file() {   # fetch_file <owner/repo> <path>
  curl -fsSL --max-time 30 -H "Accept: application/vnd.github.raw" \
    ${GITHUB_TOKEN:+-H "Authorization: token $GITHUB_TOKEN"} \
    "https://api.github.com/repos/$1/contents/$2?ref=main" 2>/dev/null
}

# 1. npm vs source
SRC_VER="$(node -p "require('$ROOT/packages/relay/package.json').version" 2>/dev/null)"
NPM_VER="$(fetch https://registry.npmjs.org/@podway/relay/latest | python3 -c 'import json,sys;print(json.load(sys.stdin)["version"])' 2>/dev/null)"
if [ -z "$NPM_VER" ]; then note "npm: could not read (network?) — skipped"
elif [ "$SRC_VER" = "$NPM_VER" ]; then note "npm @podway/relay $NPM_VER == source $SRC_VER"
else bad "npm @podway/relay is $NPM_VER but source is $SRC_VER — run \`npm publish\` from packages/relay"; fi

# 2. relay GitHub mirror vs source
MIR_VER="$(fetch_file podway-cloud/relay package.json | python3 -c 'import json,sys;print(json.load(sys.stdin)["version"])' 2>/dev/null)"
if [ -z "$MIR_VER" ]; then note "relay mirror: could not read — skipped"
elif [ "$SRC_VER" = "$MIR_VER" ]; then note "relay mirror $MIR_VER == source $SRC_VER"
else bad "relay mirror is $MIR_VER but source is $SRC_VER — run scripts/publish-relay-mirror.sh"; fi

# 3. install.sh in the source mirror vs ours (the curl | sh target — must never drift)
PUB="$(fetch_file podway-cloud/podway selfhost/install.sh | md5sum | cut -d' ' -f1)"
OWN="$(md5sum "$ROOT/selfhost/install.sh" | cut -d' ' -f1)"
if [ -z "$PUB" ] || [ "$PUB" = "d41d8cd98f00b204e9800998ecf8427e" ]; then note "published install.sh: could not read — skipped"
elif [ "$PUB" = "$OWN" ]; then note "published selfhost/install.sh == source"
else bad "published selfhost/install.sh differs from source — the oss-mirror sync has not run for this commit"; fi

[ "$FAIL" -eq 0 ] && echo "  all published artifacts match source" || echo "  PUBLISHED ARTIFACTS HAVE DRIFTED" >&2
exit "$FAIL"
