import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { computeFunnel, DAY_MS } = await import("../lib/admin-funnel");

const t0 = new Date("2026-10-01T00:00:00Z");
const u = (id: string, ref: string | null) => ({ id, ref, createdAt: t0 });

describe("sign-up funnel by ref", () => {
  it("counts nested steps per ref, with an All row first", () => {
    const users = [u("a", "email-x"), u("b", "email-x"), u("c", null), u("d", "selfhst-insider")];
    const created = new Set(["a", "b", "d"]);
    const agentIn = new Set(["a", "d", "c"]); // c never created a pod: must NOT count as agent-in
    const lastSeen = new Map([
      ["a", new Date(t0.getTime() + 2 * DAY_MS)], // came back
      ["d", new Date(t0.getTime() + 2 * 3600_000)], // same day only
    ]);
    const rows = computeFunnel(users, created, agentIn, lastSeen);
    expect(rows[0]).toEqual({ ref: "All", signedUp: 4, createdPod: 3, agentIn: 2, cameBack: 1 });
    expect(rows.find((r) => r.ref === "email-x")).toEqual({ ref: "email-x", signedUp: 2, createdPod: 2, agentIn: 1, cameBack: 1 });
    expect(rows.find((r) => r.ref === "(no ref)")).toEqual({ ref: "(no ref)", signedUp: 1, createdPod: 0, agentIn: 0, cameBack: 0 });
    expect(rows.map((r) => r.ref)).toEqual(["All", "email-x", "(no ref)", "selfhst-insider"]); // by sign-ups, then name
  });
});
