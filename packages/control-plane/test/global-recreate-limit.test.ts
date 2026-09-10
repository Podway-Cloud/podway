import { describe, expect, it, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { PodService } from "../src/index.js";
import { InMemoryPodStore } from "../src/store.js";
import { MockProvider } from "./mock-provider.js";

const PIN = "newdigest01";
const DWELL = 10 * 60 * 1000;
const longAgo = () => new Date(Date.now() - 30 * 60 * 1000).toISOString();

async function envRoot(name: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pb-adm-"));
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "podway.yaml"), `apiVersion: podway/v0\nname: ${name}\nbase:\n  image: ubuntu:24.04\n`);
  return root;
}

/**
 * THE BUG THIS PINS: BULK_UPDATE_CONCURRENCY bounds one CALL, not the box. Two owners each running
 * a bulk update got 3 lanes apiece, so the host saw 6 simultaneous recreates while both callers
 * believed they were being polite. That is the shape of the 2026-09-04 outage, where a build
 * saturated the same two NVMe devices that carry every pod.
 */
describe("recreates are bounded GLOBALLY, not just per caller", () => {
  let provider: MockProvider;
  let store: InMemoryPodStore;
  let svc: PodService;
  let root: string;

  beforeEach(async () => {
    provider = new MockProvider();
    store = new InMemoryPodStore();
    root = await envRoot("plain");
    svc = new PodService(provider, store, { environmentsRoot: root });
    provider.agentStatusResult = "idle";
  });

  async function makePod(owner: string): Promise<string> {
    const p = await svc.launchPod(owner, "plain", { size: "s", ramCap: Infinity });
    await store.update(p.id, {
      status: "running" as never,
      sessionUrl: "wss://mock/session",
      imageDigest: "olddigest",
      autoUpdate: "inherit",
      lastActiveAt: longAgo(),
    });
    return p.id;
  }

  it("two owners updating at once do NOT put 6 recreates on the box", async () => {
    for (let i = 0; i < 5; i++) await makePod("u1");
    for (let i = 0; i < 5; i++) await makePod("u2");

    // Hold every recreate open so we can measure how many are in flight at the peak.
    let inFlight = 0;
    let peak = 0;
    const holds: (() => void)[] = [];
    provider.updateImage = (async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((r) => holds.push(r));
      inFlight--;
      return { id: "x", status: "running", region: "r", endpoint: null, keepAwake: false, machineId: "m", imageDigest: PIN };
    }) as typeof provider.updateImage;

    const image = `pod-base@${PIN}`;
    await svc.updateIdlePods("u1", PIN, DWELL, image, 3);
    await svc.updateIdlePods("u2", PIN, DWELL, image, 3);
    await new Promise((r) => setTimeout(r, 80)); // let the lanes start

    // Per-CALL the cap is 3 each, which is 6. The global gate is what stops that.
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(0); // it really did start work

    for (const h of holds) h();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("every queued recreate still runs — the gate delays, it never drops", async () => {
    for (let i = 0; i < 6; i++) await makePod("u1");
    const seen: string[] = [];
    provider.updateImage = (async (id: string) => {
      seen.push(id);
      return { id, status: "running", region: "r", endpoint: null, keepAwake: false, machineId: "m", imageDigest: PIN };
    }) as typeof provider.updateImage;

    await svc.updateIdlePods("u1", PIN, DWELL, `pod-base@${PIN}`, 3);
    await new Promise((r) => setTimeout(r, 300));
    expect(seen).toHaveLength(6);
  });

  it("a FAILING recreate frees its slot, so the batch does not wedge", async () => {
    for (let i = 0; i < 4; i++) await makePod("u1");
    let n = 0;
    provider.updateImage = (async (id: string) => {
      n++;
      if (n === 1) throw new Error("incus said no");
      return { id, status: "running", region: "r", endpoint: null, keepAwake: false, machineId: "m", imageDigest: PIN };
    }) as typeof provider.updateImage;

    await svc.updateIdlePods("u1", PIN, DWELL, `pod-base@${PIN}`, 2);
    await new Promise((r) => setTimeout(r, 300));
    expect(n).toBe(4); // the other three still ran; a leaked slot would have stalled them
  });
});
