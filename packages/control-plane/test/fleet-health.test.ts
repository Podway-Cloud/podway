import { describe, expect, it } from "vitest";
import type { PodHealth } from "@podway/provider";
import { FleetHealthService, JOBS_OVERDUE_MS } from "../src/fleet-health.js";

const ok = (): PodHealth => ({ agents: [], issues: [], repairs: [], repairGaveUp: [], reachable: true });

function setup() {
  const sent: string[] = [];
  let health = ok();
  const svc = new FleetHealthService({
    listPods: async () => [{ id: "moderate-peacock-59a7", name: "podway GTM", health }],
    notify: async (t) => void sent.push(t),
  });
  return { sent, svc, set: (h: Partial<PodHealth>) => (health = { ...ok(), ...h }) };
}

describe("fleet health alerts", () => {
  it("alerts RC down once, by the pod's own name, and once more when it clears", async () => {
    const { sent, svc, set } = setup();
    set({ agents: [{ id: "claude-code", rcState: "down" } as PodHealth["agents"][number]] });
    await svc.sweep();
    await svc.sweep(); // still down: no repeat
    expect(sent).toEqual(["⚠️ Pod health: podway GTM [moderate-peacock-59a7] — Remote Control is down (auto-restore gave up)."]);
    set({});
    await svc.sweep();
    expect(sent[1]).toMatch(/^✅ Resolved: podway GTM .*Remote Control/);
    expect(sent).toHaveLength(2);
  });

  it("ignores Codex 'down' (its daemon starting after a restart)", async () => {
    const { sent, svc, set } = setup();
    set({ agents: [{ id: "codex", rcState: "down" } as PodHealth["agents"][number]] });
    await svc.sweep();
    expect(sent).toEqual([]);
  });

  it("waits 2 sweeps for a dead agent or an unreachable pod; one sweep for overdue jobs", async () => {
    const { sent, svc, set } = setup();
    set({ issues: [{ id: "agent-not-running:claude-code" } as PodHealth["issues"][number]], jobsOverdueMs: JOBS_OVERDUE_MS + 1 });
    await svc.sweep();
    expect(sent).toEqual(["⚠️ Pod health: podway GTM [moderate-peacock-59a7] — scheduled jobs are overdue by more than 2 h."]);
    await svc.sweep();
    expect(sent[1]).toMatch(/the agent is not running/);
  });

  it("an unreachable pod does not 'resolve' its open problems", async () => {
    const { sent, svc, set } = setup();
    set({ issues: [{ id: "disk-critical" } as PodHealth["issues"][number]] });
    await svc.sweep();
    set({ reachable: false, agents: [], issues: [] });
    await svc.sweep();
    await svc.sweep();
    expect(sent.some((t) => t.startsWith("✅"))).toBe(false);
    expect(sent.at(-1)).toMatch(/does not answer/);
  });
});
