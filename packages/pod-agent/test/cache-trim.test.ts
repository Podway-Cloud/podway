import { describe, it, expect } from "vitest";
import { shouldTrim, IDLE_MS, MIN_GAP_MS, type TrimState } from "../src/cache-trim.js";

describe("idle cache trim decision (guest-memory-return)", () => {
  const fresh = (): TrimState => ({ lastBusyAt: 0, lastTrimAt: -MIN_GAP_MS });

  it("never trims while the agent is working, and resets the idle clock", () => {
    const s = fresh();
    expect(shouldTrim(s, IDLE_MS * 2, true, 0)).toBe(false);
    expect(s.lastBusyAt).toBe(IDLE_MS * 2);
    expect(shouldTrim(s, IDLE_MS * 2 + 60_000, false, 0)).toBe(false); // idle clock restarted
  });

  it("never trims under CPU load (e.g. a Codex build the session file can't see)", () => {
    expect(shouldTrim(fresh(), IDLE_MS * 2, false, 1.5)).toBe(false);
  });

  it("trims after 15 idle minutes", () => {
    const s = fresh();
    expect(shouldTrim(s, IDLE_MS - 1, false, 0)).toBe(false);
    expect(shouldTrim(s, IDLE_MS, false, 0)).toBe(true);
  });

  it("at most once per hour", () => {
    const s = fresh();
    s.lastTrimAt = IDLE_MS; // just trimmed
    expect(shouldTrim(s, IDLE_MS + 60_000, false, 0)).toBe(false);
    expect(shouldTrim(s, IDLE_MS + MIN_GAP_MS, false, 0)).toBe(true);
  });
});

describe("only inside a balloon VM (never a self-host container)", () => {
  it("is false when the virtio_balloon driver dir is absent", async () => {
    const { inBalloonVm } = await import("../src/cache-trim.js");
    expect(inBalloonVm("/nonexistent/virtio_balloon")).toBe(false);
  });
});
