import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { lastHeartbeatMs, rcSilentlyDropped, RC_SILENT_MS } from "../src/rc-heartbeat.js";

// Lines copied from a real claude 2.1.296 debug log (test:1, 2026-10-13).
const LOG = [
  "2026-10-13T21:47:03.030Z [DEBUG] CCRClient: Heartbeat sent",
  "2026-10-13T21:47:35.875Z [WARN] CCRClient: Heartbeat failed: The operation timed out.",
  "2026-10-13T21:52:25.221Z [DEBUG] CCRClient: Heartbeat sent",
  "2026-10-13T21:52:30.000Z [DEBUG] MCP server \"x\": Successfully connected",
].join("\n");

describe("rc heartbeat", () => {
  it("reads the newest 'Heartbeat sent' (not a failed one, not other lines)", () => {
    const p = path.join(mkdtempSync(path.join(tmpdir(), "hb-")), "d.log");
    writeFileSync(p, LOG + "\n");
    expect(lastHeartbeatMs(p)).toBe(Date.parse("2026-10-13T21:52:25.221Z"));
    expect(lastHeartbeatMs(p + ".missing")).toBeNull();
  });

  it("truncates an oversized log", () => {
    const p = path.join(mkdtempSync(path.join(tmpdir(), "hb-")), "d.log");
    writeFileSync(p, "x".repeat(6 * 1024 * 1024));
    expect(lastHeartbeatMs(p)).toBeNull();
    expect(statSync(p).size).toBe(0);
  });

  it("judges a drop only after claude ran RC_SILENT_MS with no heartbeat that long", () => {
    const now = Date.parse("2026-10-13T22:00:00Z");
    const old = now - RC_SILENT_MS - 1000;
    expect(rcSilentlyDropped(old, old, now)).toBe(true);
    expect(rcSilentlyDropped(now - 20_000, old, now)).toBe(false); // heartbeats flowing
    expect(rcSilentlyDropped(old, now - 60_000, now)).toBe(false); // claude just restarted
    expect(rcSilentlyDropped(null, old, now)).toBe(false); // never linked: no evidence
  });
});
