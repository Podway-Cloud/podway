#!/usr/bin/env bash
# Are the hostnames we depend on actually serving a valid certificate?
#
# WHY THIS EXISTS, and why it is not an expiry monitor. Twice on 2026-09-06 a host was dead because
# its certificate was never ISSUED — it sat "Not verified" in Fly while DNS resolved fine, so the
# browser reached the edge and the TLS handshake was refused:
#   - gw.podway.cloud       -> every web terminal flapped "connecting"/"disconnected"
#   - *.preview.podway.cloud -> every preview link returned ERR_CONNECTION_CLOSED
# Neither surfaced anywhere. Fly auto-renews, so EXPIRY is the rare failure; a cert that never
# issued, or one silently dropped, is the one that actually happens. This checks the thing a user
# experiences — a real handshake — rather than what a control panel claims.
#
#   scripts/check-certs.sh           human report; exit 1 if anything is wrong
#   scripts/check-certs.sh --json    for a scheduled job
set -uo pipefail

WARN_DAYS="${WARN_DAYS:-21}"
JSON=0
[ "${1:-}" = "--json" ] && JSON=1

# Every host whose TLS failing takes a user-visible feature with it. A preview host is a wildcard, so
# probe an arbitrary label — that is exactly how a real pod URL resolves.
HOSTS="${CERT_HOSTS:-podway.io www.podway.io podway.cloud gw.podway.cloud cert-check.preview.podway.cloud}"

bad=0
rows=""
for h in $HOSTS; do
  read -r state days expiry <<<"$(python3 - "$h" <<'PY'
import ssl, socket, datetime, sys
h = sys.argv[1]
try:
    with socket.create_connection((h, 443), timeout=15) as s:
        with ssl.create_default_context().wrap_socket(s, server_hostname=h) as ss:
            d = datetime.datetime.strptime(ss.getpeercert()["notAfter"], "%b %d %H:%M:%S %Y %Z")
            d = d.replace(tzinfo=datetime.timezone.utc)  # tz-aware: utcnow() is deprecated and warns
            print("ok", (d - datetime.datetime.now(datetime.timezone.utc)).days, d.date())
except ssl.SSLError:
    print("tls_refused -1 -")          # the shape both outages took
except Exception:
    print("unreachable -1 -")
PY
)"
  if [ "$state" != "ok" ]; then
    bad=$((bad+1)); mark="← $state"
  elif [ "$days" -lt "$WARN_DAYS" ]; then
    bad=$((bad+1)); mark="← EXPIRES IN ${days}d"
  else
    mark="ok"
  fi
  [ "$JSON" = 1 ] || printf '  %-38s %-12s %s\n' "$h" "${expiry}" "$mark"
  rows="$rows{\"host\":\"$h\",\"state\":\"$state\",\"days\":$days},"
done

if [ "$JSON" = 1 ]; then
  printf '{"bad":%d,"certs":[%s]}\n' "$bad" "${rows%,}"
elif [ "$bad" = 0 ]; then
  echo "check-certs: all hosts serving a valid certificate"
else
  echo "check-certs: $bad host(s) need attention — a refused handshake means the feature is DEAD, not slow" >&2
fi
exit $([ "$bad" = 0 ] && echo 0 || echo 1)
