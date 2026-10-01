import { describe, it, expect } from "vitest";
import type { BoxStats } from "@podway/shared";
import { withHostMemory } from "../src/incus/provider.js";

// Incus's view on 2026-10-01: 49 GB "used" of 130, because guest RAM (a memfd) counts as cache.
const incusView: BoxStats = {
  name: "b", region: "b", reachable: true, cpuCores: 24,
  ramUsedMb: 49_000, ramTotalMb: 130_000, diskUsedMb: 0, diskTotalMb: 0,
  pods: [{ id: "pod-a", name: null, size: "l", slots: 4, status: "running", ramUsedMb: 3_000 }],
};
const NOW = 1_790_000_000_000;
const pub = (o: object) => JSON.stringify({ t: NOW / 1000 - 30, totalMb: 128_000, availMb: 28_000, arcMb: 15_000, ksmMb: 1_700, pods: { "pod-a": 15_300 }, ...o });

describe("box stats use the box's own memory numbers", () => {
  it("fresh host data replaces Incus's free-memory view and the guest's pod view", () => {
    const b = withHostMemory(incusView, pub({}), NOW);
    expect(b.hostMeasured).toBe(true);
    expect(b.ramUsedMb).toBe(100_000);
    expect(b.ramTotalMb).toBe(128_000);
    expect(b.cacheMb).toBe(15_000);
    expect(b.ksmSavedMb).toBe(1_700);
    expect(b.pods[0].ramUsedMb).toBe(15_300);
  });
  it("stale, missing or broken data leaves Incus's view, not a made-up number", () => {
    expect(withHostMemory(incusView, pub({ t: NOW / 1000 - 600 }), NOW)).toBe(incusView);
    expect(withHostMemory(incusView, undefined, NOW)).toBe(incusView);
    expect(withHostMemory(incusView, "{oops", NOW)).toBe(incusView);
  });
});
