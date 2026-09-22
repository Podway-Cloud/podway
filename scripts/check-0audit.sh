#!/usr/bin/env bash
# 0audit hygiene guard — keeps 0audit.md a LIVING register of CURRENTLY-TRUE items,
# NOT a changelog. It bloated to 1326 lines once (2026-08-07) because agents kept
# marking items FIXED/struck-through inline and kept a growing "Recently shipped" list
# instead of deleting done items. The register holds ONLY open issues; git log IS the
# changelog. So:
#
#   • Fixed something? DELETE its line — git history preserves it. Do NOT strike it
#     through (~~…~~) or leave a "**FIXED**"/"— SHIPPED" marker.
#   • No changelog section. A "## Recently shipped" (or similar) list is banned — that is
#     what `git log` is for, and it is the classic bloat vector.
#   • The whole file stays under a hard ceiling; past it, compact (drop done/stale items).
#
# Standalone:  scripts/check-0audit.sh [path]     (default 0audit.md)
# Wired into:  scripts/git-hooks/pre-push          (checks the PUSHED version)
# Bypass:      git push --no-verify                (emergencies only)
set -uo pipefail
F="${1:-0audit.md}"
[ -f "$F" ] || exit 0
CEIL=250

fail() { printf '%s\n' "$@" >&2; exit 1; }

total=$(wc -l < "$F")

# 1) strikethrough anywhere = a done item left in the register
if grep -q '~~' "$F"; then
  fail "" \
"  ⛔ 0audit.md uses strikethrough (~~…~~) — that marks something DONE." \
"     0audit is a LIVING register: DELETE the fixed line (git history keeps it)." \
"     offending:" \
"$(grep -nE '~~' "$F" | head -5 | sed 's/^/       /')" ""
fi

# 2) a done-status marker on a bullet = a fixed item kept instead of deleted
badmarks=$(grep -nE '^[[:space:]]*-[[:space:]]+.*(\*\*(FIXED|SHIPPED|DEPLOYED|DONE)|✅|—[[:space:]]+(FIXED|SHIPPED|DEPLOYED))' "$F" || true)
if [ -n "$badmarks" ]; then
  fail "" \
"  ⛔ 0audit.md marks an item FIXED/SHIPPED/DEPLOYED inline — DELETE it (git keeps history)." \
"     offending:" \
"$(printf '%s\n' "$badmarks" | head -5 | sed 's/^/       /')" ""
fi

# 3) no changelog section — the register is open issues ONLY; git log is the history
shipped=$(grep -niE '^#{1,6}[[:space:]]*(recently shipped|changelog|shipped|recently (done|landed)|history)\b' "$F" || true)
if [ -n "$shipped" ]; then
  fail "" \
"  ⛔ 0audit.md has a changelog section — that is banned. 0audit holds ONLY currently-true" \
"     issues; git log is the changelog. Delete the section (a notable ship needs no line here)." \
"     offending:" \
"$(printf '%s\n' "$shipped" | head -3 | sed 's/^/       /')" ""
fi

# 4) hard bloat ceiling
if [ "$total" -gt "$CEIL" ]; then
  fail "" \
"  ⛔ 0audit.md is $total lines (> $CEIL) — drifting back into a changelog." \
"     Compact it: DELETE done/stale items (git keeps them). The register holds ONLY what is" \
"     currently true. See /CLAUDE.md 'Audit register'." ""
fi

exit 0
