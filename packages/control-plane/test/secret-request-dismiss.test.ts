import { describe, expect, it, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { PodService } from "../src/index.js";
import { InMemoryPodStore } from "../src/store.js";
import { MockProvider } from "./mock-provider.js";

async function envRoot(name: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pb-secreq-dismiss-"));
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "podway.yaml"),
    `apiVersion: podway/v0\nname: ${name}\nbase:\n  image: ubuntu:24.04\n`,
  );
  return root;
}

/**
 * The owner's "Dismiss" (dashboard → pod) clears one agent secret-request. It is owner-scoped
 * — one owner cannot dismiss another's request — and resolves to the provider removing the
 * request on the pod (symmetric to the agent's `podway secrets withdraw`).
 */
describe("dismissSecretRequest (owner clears an agent request)", () => {
  let provider: MockProvider;
  let store: InMemoryPodStore;
  let root: string;

  beforeEach(async () => {
    provider = new MockProvider();
    store = new InMemoryPodStore();
    root = await envRoot("plain");
  });

  it("removes the named request on the owner's pod", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const pod = await svc.launchPod("u1", "plain", { size: "s" });
    provider.secretReqs.set(pod.id, [
      { key: "OPENAI_API_KEY", description: "summariser", at: "2026-09-11T00:00:00Z" },
      { key: "SLACK_TOKEN", description: "notify", at: "2026-09-11T00:00:00Z" },
    ]);

    await svc.dismissSecretRequest("u1", pod.id, "OPENAI_API_KEY");

    expect((await svc.secretRequests("u1", pod.id)).map((r) => r.key)).toEqual(["SLACK_TOKEN"]);
  });

  it("dismissing a key that isn't requested is a no-op success (idempotent)", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const pod = await svc.launchPod("u1", "plain", { size: "s" });
    provider.secretReqs.set(pod.id, [
      { key: "SLACK_TOKEN", description: "notify", at: "2026-09-11T00:00:00Z" },
    ]);

    await expect(svc.dismissSecretRequest("u1", pod.id, "NEVER_ASKED")).resolves.toBeUndefined();
    expect((await svc.secretRequests("u1", pod.id)).map((r) => r.key)).toEqual(["SLACK_TOKEN"]);
  });

  it("refuses a non-owner (ownership-scoped, like secretRequests)", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const pod = await svc.launchPod("u1", "plain", { size: "s" });
    provider.secretReqs.set(pod.id, [
      { key: "OPENAI_API_KEY", description: "summariser", at: "2026-09-11T00:00:00Z" },
    ]);

    await expect(svc.dismissSecretRequest("someone-else", pod.id, "OPENAI_API_KEY")).rejects.toThrow();
    // untouched — the wrong owner couldn't clear it
    expect((await svc.secretRequests("u1", pod.id)).map((r) => r.key)).toEqual(["OPENAI_API_KEY"]);
  });
});
