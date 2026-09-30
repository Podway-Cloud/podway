import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { PodService, LIST_RECONCILE_BUDGET_MS } from "../src/index.js";
import { InMemoryPodStore } from "../src/store.js";
import { MockProvider } from "./mock-provider.js";

/**
 * 2026-09-29: the owner's dashboard and billing pages sat on skeletons for ~4 s on every load. A frozen
 * pod (t3tt) was "waking", listPods reconciled it BEFORE rendering, and Incus's state call for a frozen
 * guest takes ~4 s. listPods must never wait on one slow pod longer than its budget.
 */
describe("listPods never waits on a slow pod", () => {
  it("returns within the budget while a waking pod's reconcile is slow", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "pb-list-"));
    await fs.mkdir(path.join(root, "plain"), { recursive: true });
    await fs.writeFile(path.join(root, "plain", "podway.yaml"), "apiVersion: podway/v0\nname: plain\nbase:\n  image: ubuntu:24.04\n");
    const provider = new MockProvider();
    const store = new InMemoryPodStore();
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const rec = await svc.launchPod("u1", "plain", { size: "s", ramCap: Infinity });
    await svc.provisionPending();
    await store.update(rec.id, { status: "waking" });
    const realGetPod = provider.getPod.bind(provider);
    provider.getPod = async (id: string) => {
      await new Promise((r) => setTimeout(r, 3000)); // a frozen guest's state call
      return realGetPod(id);
    };
    const t = Date.now();
    const pods = await svc.listPods("u1");
    const took = Date.now() - t;
    expect(pods.map((p) => p.id)).toEqual([rec.id]);
    expect(took).toBeLessThan(LIST_RECONCILE_BUDGET_MS + 400);
  }, 10_000);
});
