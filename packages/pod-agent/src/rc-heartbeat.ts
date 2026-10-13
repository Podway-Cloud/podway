import { closeSync, openSync, readSync, statSync, truncateSync } from "node:fs";
import { CLAUDE_DEBUG_LOG } from "./boot.js";

// boot.ts launches claude with `--debug-file CLAUDE_DEBUG_LOG`. Its `CCRClient: Heartbeat sent` lines
// (~every 20 s while Remote Control is linked) are the only liveness signal interactive RC has.
/** No heartbeat this long (with claude up at least this long) = the RC link is gone. A 5-min network cut
 * self-healed with heartbeats ~3 s after it ended (test:1, 2026-10-13); a torn-down bridge never resumes. */
export const RC_SILENT_MS = 3 * 60_000;
const MAX_BYTES = 5 * 1024 * 1024; // ~0.7 MB/day; claude appends, so a truncate is safe
const HEARTBEAT_RE = /^(\S+) \[DEBUG\] CCRClient: Heartbeat sent/;

/** Epoch ms of the newest heartbeat in the log, or null (no log / no heartbeat yet). Reads the tail only;
 * truncates an oversized log first. */
export function lastHeartbeatMs(path = CLAUDE_DEBUG_LOG): number | null {
  let fd = -1;
  try {
    const size = statSync(path).size;
    if (size > MAX_BYTES) {
      truncateSync(path, 0);
      return null;
    }
    const n = Math.min(size, 64 * 1024);
    const buf = Buffer.alloc(n);
    fd = openSync(path, "r");
    readSync(fd, buf, 0, n, size - n);
    const lines = buf.toString("utf8").split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = HEARTBEAT_RE.exec(lines[i]);
      if (m) {
        const t = Date.parse(m[1]);
        if (!Number.isNaN(t)) return t;
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd >= 0) closeSync(fd);
  }
}

/** Silent drop: claude has run for RC_SILENT_MS and its newest heartbeat is older than that. A pod with
 * no heartbeat ever logged (old launch, RC never linked) is NOT judged — no evidence either way. */
export function rcSilentlyDropped(lastBeat: number | null, claudeStartedAt: number | null, now: number): boolean {
  if (lastBeat == null || claudeStartedAt == null) return false;
  return now - claudeStartedAt >= RC_SILENT_MS && now - lastBeat >= RC_SILENT_MS;
}
