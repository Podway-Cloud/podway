import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/pod-service", () => ({ getBillingService: vi.fn() }));
const { computeRevenue, monthRange } = await import("../lib/admin-revenue");

describe("per-app revenue (30% app-maker share)", () => {
  it("sums cash by the pod's app, counts active + paying pods, and takes 30%", () => {
    const rows = computeRevenue(
      [{ item: "si_1", cashCents: 700 }, { item: "si_2", cashCents: 700 }, { item: "si_3", cashCents: 0 }, { item: "si_x", cashCents: 400 }],
      new Map([["si_1", "p1"], ["si_2", "p2"], ["si_3", "p3"]]),
      new Map([["p1", "paperless-ngx"], ["p2", "paperless-ngx"], ["p3", "memos"], ["p4", "memos"]]),
      new Set(["p1", "p2", "p3", "p4"]),
    );
    expect(rows.find((r) => r.app === "paperless-ngx")).toEqual({ app: "paperless-ngx", activePods: 2, paidPods: 2, revenueCents: 1400, shareCents: 420 });
    expect(rows.find((r) => r.app === "memos")).toEqual({ app: "memos", activePods: 2, paidPods: 0, revenueCents: 0, shareCents: 0 });
    expect(rows.find((r) => r.app === "(unmatched)")?.revenueCents).toBe(400); // never silently dropped
  });
  it("month range is UTC [start, next month)", () => {
    expect(monthRange("2026-12").map((d) => d.toISOString())).toEqual(["2026-12-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"]);
  });
});
