import { describe, it, expect } from "vitest";
import { maxSize, sizeAtLeast } from "../src/tiers.js";

describe("pod-size floor helpers (env minSize)", () => {
  it("maxSize returns the larger by the mini→xl order", () => {
    expect(maxSize("mini", "s")).toBe("s");
    expect(maxSize("m", "s")).toBe("m");
    expect(maxSize("xl", "l")).toBe("xl");
    expect(maxSize("m", "m")).toBe("m");
  });
  it("sizeAtLeast checks the floor", () => {
    expect(sizeAtLeast("m", "s")).toBe(true);
    expect(sizeAtLeast("s", "s")).toBe(true);
    expect(sizeAtLeast("mini", "s")).toBe(false); // Mini is below the Small floor
  });
});
