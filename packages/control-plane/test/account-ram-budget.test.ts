import { describe, expect, it, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { PodService } from "../src/index.js";
import { InMemoryPodStore } from "../src/store.js";
import { ControlError } from "../src/types.js";
import { MockProvider } from "./mock-provider.js";

/** Minimal env so launch resolves. */
async function envRoot(name: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pb-ram-"));
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "podway.yaml"),
    `apiVersion: podway/v0\nname: ${name}\nbase:\n  image: ubuntu:24.04\n`,
  );
  return root;
}

/**
 * Per-account RAM budget (replaced the old slot budget). A pod spends its size's RAM (mini 1 · s 2 ·
 * m 4 · l 8 · xl 16 GB); each account has 16 GB. Suspending frees it; resuming/resizing must still
 * fit. Admins pass ramCap: Infinity and are never limited. Over budget ⇒ `capacity_limit`.
 */
describe("account RAM budget", () => {
  let provider: MockProvider;
  let store: InMemoryPodStore;
  let root: string;
  const svc = () => new PodService(provider, store, { environmentsRoot: root });

  beforeEach(async () => {
    provider = new MockProvider();
    store = new InMemoryPodStore();
    root = await envRoot("plain");
  });

  const suspend = (id: string) => store.update(id, { status: "suspended" });

  it("counts RAM by size and excludes suspended pods", async () => {
    const s = svc();
    const small = await s.launchPod("u1", "plain", { size: "s" }); // 2
    await s.launchPod("u1", "plain", { size: "m" }); // 4 → used 6
    expect((await s.accountRamUsage("u1")).usedGb).toBe(6);
    await suspend(small.id);
    expect((await s.accountRamUsage("u1")).usedGb).toBe(4); // small freed
  });

  it("refuses a launch that would exceed the 16 GB budget", async () => {
    const s = svc();
    await s.launchPod("u1", "plain", { size: "xl" }); // 16 → full
    await expect(s.launchPod("u1", "plain", { size: "mini" })).rejects.toMatchObject({
      code: "capacity_limit",
    });
    // …and the failed launch wrote nothing.
    expect((await s.accountRamUsage("u1")).usedGb).toBe(16);
  });

  it("two large pods fill the budget; the next is refused", async () => {
    const s = svc();
    await s.launchPod("u1", "plain", { size: "l" }); // 8
    await s.launchPod("u1", "plain", { size: "l" }); // 8 → used 16
    await expect(s.launchPod("u1", "plain", { size: "mini" })).rejects.toBeInstanceOf(ControlError);
  });

  it("suspending a pod frees its RAM for a new one", async () => {
    const s = svc();
    const big = await s.launchPod("u1", "plain", { size: "xl" }); // full
    await expect(s.launchPod("u1", "plain", { size: "s" })).rejects.toMatchObject({ code: "capacity_limit" });
    await suspend(big.id);
    // Now there's room.
    await expect(s.launchPod("u1", "plain", { size: "s" })).resolves.toBeTruthy();
  });

  it("resuming a suspended pod is blocked when the freed RAM got taken", async () => {
    const s = svc();
    const big = await s.launchPod("u1", "plain", { size: "xl" }); // 16
    await suspend(big.id); // freed → used 0
    await s.launchPod("u1", "plain", { size: "xl" }); // another → used 16
    // Resuming the first would need 16 more — no room.
    await expect(s.wake("u1", big.id)).rejects.toMatchObject({ code: "capacity_limit" });
  });

  it("refuses a resize-up that would not fit", async () => {
    const s = svc();
    const small = await s.launchPod("u1", "plain", { size: "m" }); // 4
    await store.update(small.id, { status: "running" });
    await s.launchPod("u1", "plain", { size: "l" }); // 8 → used 12
    // m→xl swaps 4 for 16 → 12-4+16 = 24 > 16.
    await expect(s.startPodResize("u1", small.id, "xl")).rejects.toMatchObject({ code: "capacity_limit" });
  });

  it("is scoped per account — one owner's pods don't spend another's", async () => {
    const s = svc();
    await s.launchPod("u1", "plain", { size: "xl" }); // u1 full
    await expect(s.launchPod("u2", "plain", { size: "xl" })).resolves.toBeTruthy(); // u2 unaffected
  });

  it("admins (Infinity cap) are never limited", async () => {
    const s = svc();
    for (let i = 0; i < 3; i++) await s.launchPod("admin", "plain", { size: "xl", ramCap: Infinity }); // 48
    expect((await s.accountRamUsage("admin")).usedGb).toBe(48);
    await expect(s.launchPod("admin", "plain", { size: "xl", ramCap: Infinity })).resolves.toBeTruthy();
  });
});
