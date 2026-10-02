import { describe, it, expect } from "vitest";
import type { BoxStats } from "@podway/shared";
import { boxCapacity } from "../lib/box-capacity";

const pod = (id: string, size: string, status: string, ramUsedMb: number | null) => ({
  id, name: id, size, slots: 0, status, ramUsedMb,
});
// 128 GB box: one XL (16) at 8 GB, one L (8) at 2 GB, one M (4) stopped. KSM merged 2 GB.
const box: BoxStats = {
  name: "b", region: "b", reachable: true, cpuCores: 24, hostMeasured: true,
  ramTotalMb: 128 * 1024, ramUsedMb: 40 * 1024, diskUsedMb: 0, diskTotalMb: 0, ksmSavedMb: 2 * 1024,
  pods: [pod("a", "xl", "running", 8 * 1024), pod("b", "l", "running", 2 * 1024), pod("c", "m", "suspended", null)],
};

describe("box capacity model", () => {
  it("sold counts every pod; use ratio counts running pods, net of KSM", () => {
    const c = boxCapacity(box, 250);
    expect(c.soldMb).toBe(28 * 1024); // 16 + 8 + 4
    expect(c.podsMb).toBe(8 * 1024); // 8 + 2 RSS − 2 KSM
    expect(c.useRatio).toBeCloseTo(8 / 24); // of the 24 GB promised to running pods
    expect(c.otherMb).toBe(32 * 1024); // 40 used − 8 pods (ZFS cache + host)
    expect(c.freeMb).toBe(88 * 1024);
  });
  it("projects RAM at the sales gate and calls it", () => {
    const c = boxCapacity(box, 250);
    expect(c.projectedMb).toBe(Math.round((8 / 24) * 250 * 1024 + 32 * 1024)); // ≈ 115 GB of 128
    expect(c.verdict).toBe("tight");
    expect(boxCapacity(box, 150).verdict).toBe("fits");
    expect(boxCapacity(box, 400).verdict).toBe("over");
    expect(boxCapacity(box, null).verdict).toBeNull();
  });
});
