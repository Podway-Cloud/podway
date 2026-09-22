#!/usr/bin/env bash
# 0asks hygiene guard — keeps 0asks.md a LIVE to-do list of what is still waiting on the
# OWNER, not a log of everything ever asked. The failure mode it prevents: done asks kept
# around (ticked `[x]`, struck through, or marked DONE) so the file grows and the owner has
# to dig for what still needs them. The rule: an ask that is done is DELETED, not ticked —
# git history keeps it. So every checkbox in the file is OPEN (`- [ ]`); a ticked one is a
# done item that should have been removed.
#
# A non-checkbox "## Decided" section (decisions kept so they are not re-litigated) is fine —
# it is not an ask and carries no checkbox.
#
# Standalone:  scripts/check-0asks.sh [path]      (default 0asks.md)
# Wired into:  scripts/git-hooks/pre-push          (checks the PUSHED version)
# Bypass:      git push --no-verify                (emergencies only)
set -uo pipefail
F="${1:-0asks.md}"
[ -f "$F" ] || exit 0
CEIL=160

fail() { printf '%s\n' "$@" >&2; exit 1; }

total=$(wc -l < "$F")

# 1) a TICKED checkbox = a done ask kept instead of deleted
ticked=$(grep -nE '^[[:space:]]*- \[[xX]\]' "$F" || true)
if [ -n "$ticked" ]; then
  fail "" \
"  ⛔ 0asks.md has a ticked checkbox ( - [x] ) — that is a DONE ask kept in the list." \
"     DELETE it (git history preserves it). Every checkbox here must be OPEN ( - [ ] )." \
"     offending:" \
"$(printf '%s\n' "$ticked" | head -5 | sed 's/^/       /')" ""
fi

# 2) strikethrough = a done item left behind
if grep -q '~~' "$F"; then
  fail "" \
"  ⛔ 0asks.md uses strikethrough (~~…~~) — DELETE the done line instead (git keeps it)." \
"     offending:" \
"$(grep -nE '~~' "$F" | head -5 | sed 's/^/       /')" ""
fi

# 3) an inline DONE/SHIPPED marker on a bullet
badmarks=$(grep -nE '^[[:space:]]*-[[:space:]]+.*(\*\*(DONE|FIXED|SHIPPED|RESOLVED)|✅|— *(DONE|SHIPPED|RESOLVED))' "$F" || true)
if [ -n "$badmarks" ]; then
  fail "" \
"  ⛔ 0asks.md marks an item DONE/RESOLVED inline — DELETE it (git keeps history)." \
"     offending:" \
"$(printf '%s\n' "$badmarks" | head -5 | sed 's/^/       /')" ""
fi

# 4) hard bloat ceiling
if [ "$total" -gt "$CEIL" ]; then
  fail "" \
"  ⛔ 0asks.md is $total lines (> $CEIL) — it is a to-do list, not a log." \
"     Compact it: DELETE asks the owner has handled (git keeps them)." ""
fi

exit 0
