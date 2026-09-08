import { describe, it, expect } from "vitest";
import { normalizeUpdateIds, MAX_IDS } from "@/lib/admin-update-ids";

describe("normalizeUpdateIds — admin bulk pod-image update", () => {
  it("R.2: accepts more than the old 24-id cap (a whole fleet in one call)", () => {
    const ids = Array.from({ length: 26 }, (_, i) => `pod-${i}`);
    const r = normalizeUpdateIds(ids);
    // The old endpoint returned 400 "at most 24 ids" here; that was the pain R.2 removes.
    expect("ids" in r && r.ids).toEqual(ids);
  });

  it("dedupes repeated ids so a pod is never queued or recreated twice", () => {
    const r = normalizeUpdateIds(["a", "b", "a", "b", "c"]);
    expect("ids" in r && r.ids).toEqual(["a", "b", "c"]);
  });

  it("drops non-string and empty entries", () => {
    const r = normalizeUpdateIds(["a", "", 3, null, "b", undefined]);
    expect("ids" in r && r.ids).toEqual(["a", "b"]);
  });

  it("rejects an empty list", () => {
    expect(normalizeUpdateIds([])).toEqual({ error: "ids[] required", status: 400 });
  });

  it("rejects a non-array body", () => {
    expect(normalizeUpdateIds(undefined)).toEqual({
      error: "body must be JSON: { ids: string[] }",
      status: 400,
    });
    expect(normalizeUpdateIds("pod-1")).toEqual({
      error: "body must be JSON: { ids: string[] }",
      status: 400,
    });
  });

  it("rejects a payload past the abuse ceiling (not a fleet-size limit)", () => {
    const ids = Array.from({ length: MAX_IDS + 1 }, (_, i) => `pod-${i}`);
    expect(normalizeUpdateIds(ids)).toEqual({
      error: `at most ${MAX_IDS} ids per call`,
      status: 400,
    });
  });

  it("accepts exactly the ceiling", () => {
    const ids = Array.from({ length: MAX_IDS }, (_, i) => `pod-${i}`);
    const r = normalizeUpdateIds(ids);
    expect("ids" in r && r.ids.length).toBe(MAX_IDS);
  });
});
