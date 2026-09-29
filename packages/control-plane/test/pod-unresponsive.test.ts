import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { PodService, UNRESPONSIVE_MS } from "../src/index.js";
import { InMemoryPodStore } from "../src/store.js";
import { MockProvider } from "./mock-provider.js";

/**
 * 2026-09-29: three pods' VMs were "Running" but their guests were frozen (no agent, no IP). The DB
 * showed "resuming…" for hours with no error and no alert. A running VM whose agent never answers for
 * UNRESPONSIVE_MS must be recorded and alerted — once — and its recovery recorded too.
 */
describe("frozen pod detection", () => {
  let provider: MockProvider;
  let store: InMemoryPodStore;
  let root: string;
  let alerts: { id: string; recovered: boolean }[];
  let svc: PodService;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
    provider = new MockProvider();
    store = new InMemoryPodStore();
    root = await fs.mkdtemp(path.join(os.tmpdir(), "pb-frozen-"));
    await fs.mkdir(path.join(root, "plain"), { recursive: true });
    await fs.writeFile(path.join(root, "plain", "podway.yaml"), "apiVersion: podway/v0\nname: plain\nbase:\n  image: ubuntu:24.04\n");
    alerts = [];
    svc = new PodService(provider, store, {
      environmentsRoot: root,
      onPodUnresponsive: async (p, i) => void alerts.push({ id: p.id, recovered: i.recovered }),
    });
  });
  afterEach(() => vi.useRealTimers());

  async function frozenPod() {
    const rec = await svc.launchPod("u1", "plain", { size: "s", ramCap: Infinity });
    await svc.provisionPending();
    await store.update(rec.id, { status: "running" });
    provider.forceStatus(rec.id, "running");
    provider.agentReady = async () => false; // the VM runs, the guest never answers
    return rec.id;
  }

  it("alerts once after 10 minutes, not before, and records it on the timeline", async () => {
    const id = await frozenPod();
    await svc.reconcile(id);
    vi.setSystemTime(Date.now() + UNRESPONSIVE_MS - 60_000);
    await svc.reconcile(id);
    expect(alerts).toEqual([]);
    vi.setSystemTime(Date.now() + 60_000);
    await svc.reconcile(id);
    vi.setSystemTime(Date.now() + 5 * 60_000);
    await svc.reconcile(id); // still frozen: no second alert
    expect(alerts).toEqual([{ id, recovered: false }]);
    expect((await svc.podEvents("u1", id)).some((e) => e.type === "pod_unresponsive")).toBe(true);
  });

  it("records recovery when the agent answers again", async () => {
    const id = await frozenPod();
    await svc.reconcile(id);
    vi.setSystemTime(Date.now() + UNRESPONSIVE_MS);
    await svc.reconcile(id);
    provider.agentReady = async () => true;
    await svc.reconcile(id);
    expect(alerts).toEqual([{ id, recovered: false }, { id, recovered: true }]);
  });
});
