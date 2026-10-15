import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { bridgeDeadSinceMs, rcBridgeDead, RC_DEAD_GRACE_MS } from "../src/rc-heartbeat.js";

const file = (body: string) => {
  const p = path.join(mkdtempSync(path.join(tmpdir(), "rc-")), "d.log");
  writeFileSync(p, body + "\n");
  return p;
};
// Real claude 2.1.296 lines (podway pods, 2026-10-14/15).
const CONNECTED = '2026-10-15T06:20:00.000Z [DEBUG] [bridge:repl] handleStateChange state=connected detail="undefined"';
const TORN = "2026-10-15T06:37:05.669Z [DEBUG] [remote-bridge] Torn down (archive=200)";

describe("rc bridge liveness", () => {
  // The false alarm: a healthy, idle claude wrote NOTHING from 06:34:00 to 06:37:02 (podway dev, 69 cycles/12 h).
  it("a quiet spell with no teardown is NOT a dead link, however long", () => {
    const p = file([CONNECTED, "2026-10-15T06:34:00.607Z [DEBUG] CCRClient: Heartbeat sent"].join("\n"));
    expect(bridgeDeadSinceMs(p)).toBeNull();
    expect(rcBridgeDead(bridgeDeadSinceMs(p), Date.parse("2026-10-15T09:00:00Z"))).toBe(false);
  });

  it("a teardown with no reconnect after it is dead — after the grace time", () => {
    const p = file([CONNECTED, TORN].join("\n"));
    const since = bridgeDeadSinceMs(p);
    expect(since).toBe(Date.parse("2026-10-15T06:37:05.669Z"));
    expect(rcBridgeDead(since, since! + RC_DEAD_GRACE_MS - 1)).toBe(false); // claude's own retry first
    expect(rcBridgeDead(since, since! + RC_DEAD_GRACE_MS)).toBe(true);
  });

  it("a teardown followed by connected is alive", () => {
    const p = file([TORN, "2026-10-15T06:37:20.000Z [DEBUG] [remote-bridge] v2 transport connected"].join("\n"));
    expect(bridgeDeadSinceMs(p)).toBeNull();
  });

  it("missing log = no evidence; an oversized log is truncated", () => {
    expect(bridgeDeadSinceMs("/nonexistent/d.log")).toBeNull();
    const p = file("x".repeat(6 * 1024 * 1024));
    expect(bridgeDeadSinceMs(p)).toBeNull();
    expect(statSync(p).size).toBe(0);
  });
});
