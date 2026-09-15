#!/usr/bin/env bash
# NIGHTLY real-pod smoke — the "does a pod actually live on real Incus" net that unit/e2e can't be.
# It drives ONE throwaway scratch pod through the platform's own lifecycle verbs on the real box and
# the real pod-base image: provision → (suspend = incus stop) → (resume = incus start) → destroy
# (= incus delete). It catches what a mocked provider never will — a broken pod-base image, a ZFS/
# Incus regression, a boot that no longer comes up — before a customer launch does.
#
#   scripts/smoke-realpod.sh          # on the box (runner or `ssh builder@10.200.0.1`)
#
# SAFETY: touches ONLY its own uniquely-named `smoke-*` instance; a trap force-deletes it on ANY exit
# (incl. failure/interrupt), so it never leaves a ghost and never touches a customer pod. Every incus
# call gets `</dev/null` (the scripting gotcha: a stray stdin makes incus misparse as YAML).
set -uo pipefail

# Off-box (no incus) → skip cleanly rather than fail, so a manual/mis-triggered run is a no-op.
command -v incus >/dev/null 2>&1 || { echo "smoke-realpod: no 'incus' here — skipping (not the box)"; exit 0; }

# The Incus storage pool is still named `podbay` — Incus has no pool rename, so the podbay→podway
# rename left it as-is (all live pods sit on it). Do NOT "correct" this to `podway`.
POOL="${PODWAY_INCUS_POOL:-podbay}"
IMAGE="${PODWAY_POD_BASE_ALIAS:-pod-base}"
NAME="smoke-$(date +%s)-$$"

fail=0
pass() { printf '  ✓ %s\n' "$1"; }
bad()  { printf '  ✗ %s\n' "$1" >&2; fail=1; }

cleanup() { incus delete "$NAME" --force </dev/null >/dev/null 2>&1 || true; }
trap cleanup EXIT

state() { incus list "^${NAME}\$" --format csv -c s </dev/null 2>/dev/null | head -1; }
exec_ok() { incus exec "$NAME" -- true </dev/null >/dev/null 2>&1; }
wait_exec() { for _ in $(seq 1 "${1:-60}"); do exec_ok && return 0; sleep 1; done; return 1; }

echo "smoke-realpod: $NAME (image=$IMAGE pool=$POOL)"

# 1) PROVISION — launch from the real pod-base into the real pool, wait for the guest to answer.
if ! incus launch "$IMAGE" "$NAME" -s "$POOL" -c limits.memory=1GiB -c limits.cpu=2 </dev/null >/dev/null 2>&1; then
  bad "provision: incus launch failed"
  exit 1 # nothing to suspend/resume; the trap still cleans up
fi
if wait_exec 90; then pass "provision: guest is up (exec works)"; else bad "provision: guest never became reachable"; fi
[ "$(state)" = "RUNNING" ] && pass "provision: state RUNNING" || bad "provision: state is '$(state)', expected RUNNING"

# 2) SUSPEND — the platform's user-suspend is a plain `incus stop` (provider.sleep → setState 'stop').
incus stop "$NAME" </dev/null >/dev/null 2>&1 || bad "suspend: incus stop failed"
[ "$(state)" = "STOPPED" ] && pass "suspend: state STOPPED" || bad "suspend: state is '$(state)', expected STOPPED"
exec_ok && bad "suspend: guest still answers while stopped (should not)" || pass "suspend: guest is down"

# 3) RESUME — provider.wake → setState 'start'. The pod must come back and answer again.
incus start "$NAME" </dev/null >/dev/null 2>&1 || bad "resume: incus start failed"
if wait_exec 90; then pass "resume: guest is up again after suspend/resume"; else bad "resume: guest never came back"; fi
[ "$(state)" = "RUNNING" ] && pass "resume: state RUNNING" || bad "resume: state is '$(state)', expected RUNNING"

# 4) DESTROY — provider.destroy → delete the instance (and its home volume). Must actually be gone.
incus delete "$NAME" --force </dev/null >/dev/null 2>&1 || bad "destroy: incus delete failed"
if incus info "$NAME" </dev/null >/dev/null 2>&1; then bad "destroy: instance still present after delete"; else pass "destroy: instance is gone"; fi

if [ "$fail" = 0 ]; then echo "smoke-realpod: OK — full lifecycle healthy"; else echo "smoke-realpod: FAILED" >&2; fi
exit "$fail"
