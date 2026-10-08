import { describe, it, expect } from "vitest";
import { freePodIdle, FREE_POD_IDLE_MS } from "../src/service.js";
import { freePodId } from "../src/billing.js";

/** selfh.st insider guardrails: which pod is the free one, and when it counts as idle. */
const DAY = 24 * 60 * 60_000;
const now = Date.parse("2026-12-31T00:00:00Z");
const ago = (d: number) => new Date(now - d * DAY).toISOString();

describe("insider free pod + idle rule", () => {
  it("the free pod is the biggest that fits a Small", () => {
    expect(freePodId([{ podId: "a", size: "mini" }, { podId: "b", size: "s" }, { podId: "c", size: "m" }], 2)).toBe("b");
    expect(freePodId([{ podId: "c", size: "m" }], 2)).toBeNull();
  });

  it("idle only when BOTH traffic and agent are quiet for 60 days; unknown agent = not idle", () => {
    expect(freePodIdle(ago(61), 61 * DAY, now, FREE_POD_IDLE_MS)).toBe(true);
    expect(freePodIdle(ago(61), 10 * DAY, now, FREE_POD_IDLE_MS)).toBe(false); // agent worked recently
    expect(freePodIdle(ago(5), 61 * DAY, now, FREE_POD_IDLE_MS)).toBe(false); // someone used it
    expect(freePodIdle(ago(90), null, now, FREE_POD_IDLE_MS)).toBe(false);
  });
});
