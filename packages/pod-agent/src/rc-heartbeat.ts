import { closeSync, openSync, readSync, statSync, truncateSync } from "node:fs";
import { CLAUDE_DEBUG_LOG } from "./boot.js";

// boot.ts launches claude with `--debug-file CLAUDE_DEBUG_LOG`. The bridge logs its own state there.
// 2026-10-15: judging by HEARTBEAT GAPS was wrong — an idle or busy claude goes quiet for 3+ minutes with a
// perfectly healthy link (podway dev: 69 false cycles in 12 h, each a new session in the owner's app). A
// link is dead only when claude SAYS so: a teardown/failed line with no "connected" line after it.
export const RC_DEAD_GRACE_MS = 2 * 60_000; // let claude's own reconnect try first
const MAX_BYTES = 5 * 1024 * 1024; // claude appends, so a truncate is safe
const DEAD_RE = /^(\S+) .*(\[remote-bridge\] Torn down|Teardown complete|handleStateChange state=failed)/;
const LIVE_RE = /^(\S+) .*(handleStateChange state=connected|\[remote-bridge\] v2 transport connected)/;

/** When the bridge was last declared dead and not reconnected since (epoch ms), else null. Reads the tail
 * only; truncates an oversized log first (losing the evidence means "not dead" — the safe side). */
export function bridgeDeadSinceMs(path = CLAUDE_DEBUG_LOG): number | null {
  let fd = -1;
  try {
    const size = statSync(path).size;
    if (size > MAX_BYTES) {
      truncateSync(path, 0);
      return null;
    }
    const n = Math.min(size, 256 * 1024);
    const buf = Buffer.alloc(n);
    fd = openSync(path, "r");
    readSync(fd, buf, 0, n, size - n);
    const lines = buf.toString("utf8").split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (LIVE_RE.test(lines[i])) return null; // connected after any teardown
      const m = DEAD_RE.exec(lines[i]);
      if (m) {
        const t = Date.parse(m[1]);
        return Number.isNaN(t) ? null : t;
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd >= 0) closeSync(fd);
  }
}

/** Dead link worth restoring: claude declared the bridge dead RC_DEAD_GRACE_MS ago and never reconnected. */
export function rcBridgeDead(deadSince: number | null, now: number): boolean {
  return deadSince != null && now - deadSince >= RC_DEAD_GRACE_MS;
}
