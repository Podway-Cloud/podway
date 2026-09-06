#!/usr/bin/env bash
# Is the e2e suite currently RED on the pull-request path?
#
# e2e is deliberately NOT a required check (owner's call, 2026-09-06): it takes ~13 minutes and an
# occasional flake should not block a merge. The cost of that choice is that a genuinely broken
# suite is invisible — nothing goes red in front of anyone, so nobody looks.
#
# It went exactly that way: three specs failed on #214, #215, #216 and #218 with identical line
# numbers, and every one of those PRs was merged straight through. Not one of the three was a
# product bug — they asserted a random-slug pod name after the product moved to friendly names,
# relay copy that no longer existed, and a walkthrough modal that had become a coach-mark tour. The
# suite had stopped describing the app and no one could tell, because a check that never blocks
# anything looks the same whether it passes or fails.
#
# So this asks the question directly, on the daily sweep, and SHOUTS. It never blocks a merge —
# that is the point of the trade — it just refuses to let a red suite stay quiet.
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-velsa/podway}"
TOKEN="${GITHUB_TOKEN:-${GH_WORKFLOW_TOKEN:-${GH_TOKEN:-}}}"
LOOKBACK="${E2E_LOOKBACK:-6}"

if [ -z "$TOKEN" ]; then
  echo "check-e2e-health: no token available — skipping (not a failure)."
  exit 0
fi

api() { curl -fsSL -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" "$@"; }

prs="$(api "https://api.github.com/repos/$REPO/pulls?state=closed&per_page=$LOOKBACK&sort=updated&direction=desc" 2>/dev/null || true)"
if [ -z "$prs" ]; then
  echo "check-e2e-health: could not reach the API — skipping (not a failure)."
  exit 0
fi

shas="$(printf '%s' "$prs" | python3 -c '
import json,sys
try: d=json.load(sys.stdin)
except Exception: sys.exit(0)
for p in d: print(p["number"], p["head"]["sha"])
')"

red=0; seen=0; report=""
while read -r num sha; do
  [ -n "${sha:-}" ] || continue
  runs="$(api "https://api.github.com/repos/$REPO/commits/$sha/check-runs" 2>/dev/null || true)"
  [ -n "$runs" ] || continue
  verdict="$(printf '%s' "$runs" | python3 -c '
import json,sys
try: d=json.load(sys.stdin)
except Exception: sys.exit(0)
# A PR head can carry several runs of a name (re-runs); the LAST completed one is its verdict.
c=[x.get("conclusion") for x in d.get("check_runs",[]) if x["name"]=="e2e" and x["status"]=="completed"]
print(c[-1] if c else "")
')"
  [ -n "$verdict" ] || continue
  seen=$((seen+1))
  report="${report}    PR #${num}: e2e=${verdict}"$'\n'
  [ "$verdict" = "failure" ] && red=$((red+1))
done <<< "$shas"

if [ "$seen" -eq 0 ]; then
  echo "check-e2e-health: no e2e verdicts in the last $LOOKBACK PRs — nothing to judge."
  exit 0
fi

printf '%s' "$report"
if [ "$red" -gt 0 ]; then
  cat >&2 <<MSG

  ============================================================================
  e2e is RED on $red of the last $seen pull requests.

  e2e is not a required check, so nothing blocked those merges and nothing will
  block the next one. That is deliberate — and it is exactly why this shouts.

  Reproduce locally (the suite DOES run on a pod):
    PODWAY_E2E_PG=postgresql://dev@localhost:5432/postgres PODWAY_TEST_LOGIN=1 \\
      pnpm --filter @podway/web exec playwright test

  Before "fixing" a test by relaxing it: check whether the PRODUCT changed on
  purpose. All three failures found on 2026-09-06 were stale assertions, but the
  only way to know is to read the code the assertion is about.
  ============================================================================
MSG
  exit 1
fi

echo "check-e2e-health: e2e green across the last $seen pull requests."
