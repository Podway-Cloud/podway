import { describe, expect, it, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateCredKey } from "@podway/shared/crypto";
import { PodService, SecretVault, type SecretStore } from "../src/index.js";
import { InMemoryPodStore } from "../src/store.js";
import { MockProvider } from "./mock-provider.js";

class MemSecretStore implements SecretStore {
  rows = new Map<string, string>();
  private k(p: string, key: string) { return `${p} ${key}`; }
  async get(p: string, key: string) { const blob = this.rows.get(this.k(p, key)); return blob ? { blob } : null; }
  async upsert(p: string, key: string, blob: string) { this.rows.set(this.k(p, key), blob); }
  async delete(p: string, key: string) { this.rows.delete(this.k(p, key)); }
  async listKeys(p: string) {
    return [...this.rows.keys()].filter((k) => k.startsWith(`${p} `)).map((k) => k.split(" ")[1]!).sort();
  }
  async all(p: string) {
    return [...this.rows.entries()].filter(([k]) => k.startsWith(`${p} `)).map(([k, blob]) => ({ key: k.split(" ")[1]!, blob }));
  }
}

async function envRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pb-selfheal-"));
  await fs.mkdir(path.join(root, "plain"), { recursive: true });
  await fs.writeFile(path.join(root, "plain", "podway.yaml"), "apiVersion: podway/v0\nname: plain\nbase:\n  image: ubuntu:24.04\n");
  return root;
}

/**
 * THE BUG THIS PINS (owner report, 2026-09-07). An Incus image update recreates the instance from a
 * fresh root filesystem, so /etc/podway/secrets.env is destroyed. Restoring it hung off
 * `status !== record.status` — a status TRANSITION — but an update takes a pod running → running, so
 * the condition was false exactly when the file had just been destroyed. The ops pod then ran for
 * hours with no APIFY/TELEGRAM keys, its scheduled jobs failed, and it told its owner the secrets
 * were "gone" — they were safe in the vault the entire time.
 */
describe("the in-pod secrets file self-heals, whatever the pod's status did", () => {
  let provider: MockProvider;
  let store: InMemoryPodStore;
  let vault: SecretVault;
  let mem: MemSecretStore;
  let root: string;

  beforeEach(async () => {
    provider = new MockProvider();
    store = new InMemoryPodStore();
    mem = new MemSecretStore();
    vault = new SecretVault(mem, Buffer.from(generateCredKey(), "base64"));
    root = await envRoot();
  });

  const svc = () => new PodService(provider, store, { environmentsRoot: root, secretVault: vault });

  /** Make the pod claim its secrets file is absent, and count how often it is asked. */
  function fileMissing(missing: boolean) {
    const calls = { probes: 0 };
    provider.exec = (async (_id: string, cmd: string[]) => {
      if (cmd[0] === "test" && cmd.includes("/etc/podway/secrets.env")) {
        calls.probes++;
        return { exitCode: missing ? 1 : 0, stdout: "", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as typeof provider.exec;
    return calls;
  }

  async function podWithSecrets() {
    const s = svc();
    const rec = await s.launchPod("u1", "plain", { size: "s", ramCap: Infinity });
    await s.provisionPending();
    await store.update(rec.id, { status: "running" as never, sessionUrl: "wss://mock/session" });
    provider.forceStatus(rec.id, "running"); // the LIVE status is what reconcile gates on
    await s.setSecret("u1", rec.id, "APIFY_API_TOKEN", "tok-1");
    provider.injectedSecrets = undefined;
    return { s, id: rec.id };
  }

  it("restores the file when it is MISSING, with no status change at all", async () => {
    const { s, id } = await podWithSecrets();
    fileMissing(true);
    await s.reconcile(id);
    expect(provider.injectedSecrets).toMatchObject({ APIFY_API_TOKEN: "tok-1" });
  });

  it("does NOTHING when the file is already there", async () => {
    const { s, id } = await podWithSecrets();
    fileMissing(false);
    await s.reconcile(id);
    expect(provider.injectedSecrets).toBeUndefined();
  });

  it("records it on the timeline — a pod that was running without secrets was failing silently", async () => {
    const { s, id } = await podWithSecrets();
    fileMissing(true);
    await s.reconcile(id);
    const events = await s.podEvents("u1", id).catch(() => [] as { type: string }[]);
    expect(events.some((e) => e.type === "secrets_restored")).toBe(true);
  });

  it("SAYS SO when it has no vault, instead of returning silently", async () => {
    // The failure that made the fix useless in production: the gateway runs the reconcile sweep but
    // was never given a secretVault, so this returned instantly on every sweep and the ops pod sat
    // broken with a correct, deployed fix (2026-09-07). A repair that cannot run must announce it.
    const lines: string[] = [];
    const s = new PodService(provider, store, {
      environmentsRoot: root,
      // deliberately NO secretVault
      logger: { debug: () => {}, info: () => {}, warn: (e: string) => lines.push(e), error: (e: string) => lines.push(e) } as never,
    });
    const rec = await s.launchPod("u1", "plain", { size: "s", ramCap: Infinity });
    await s.provisionPending();
    await store.update(rec.id, { status: "running" as never, sessionUrl: "wss://mock/session" });
    provider.forceStatus(rec.id, "running");

    await s.reconcile(rec.id);
    expect(lines).toContain("secrets_selfheal_disabled_no_vault");
  });

  it("a pod with NO secrets is never probed — the check costs nothing on the common path", async () => {
    const s = svc();
    const rec = await s.launchPod("u1", "plain", { size: "s", ramCap: Infinity });
    await s.provisionPending();
    await store.update(rec.id, { status: "running" as never, sessionUrl: "wss://mock/session" });
    provider.forceStatus(rec.id, "running");
    const calls = fileMissing(true);
    await s.reconcile(rec.id);
    expect(calls.probes).toBe(0);
  });

  it("a FAILED restore is logged, not swallowed into silence", async () => {
    // The property that actually matters. Swallowing is correct here — one pod's failure must not
    // stall a fleet sweep — but the failure vanishing is what made three outages invisible on
    // 2026-09-07. Same control flow, but it reaches the log.
    const lines: { event: string; detail?: Record<string, unknown> }[] = [];
    const s = new PodService(provider, store, {
      environmentsRoot: root,
      secretVault: vault,
      logger: {
        debug: () => {},
        info: (event: string, detail?: Record<string, unknown>) => lines.push({ event, detail }),
        warn: (event: string, detail?: Record<string, unknown>) => lines.push({ event, detail }),
        error: (event: string, detail?: Record<string, unknown>) => lines.push({ event, detail }),
      } as never,
    });
    const rec = await s.launchPod("u1", "plain", { size: "s", ramCap: Infinity });
    await s.provisionPending();
    await store.update(rec.id, { status: "running" as never, sessionUrl: "wss://mock/session" });
    provider.forceStatus(rec.id, "running");
    await s.setSecret("u1", rec.id, "APIFY_API_TOKEN", "tok-1");

    fileMissing(true);
    provider.injectSecrets = (async () => {
      throw new Error("incus push refused");
    }) as typeof provider.injectSecrets;

    await s.reconcile(rec.id); // must NOT throw — the sweep keeps going
    expect(lines.some((l) => l.event === "best_effort_failed" || l.event === "secret_inject_failed")).toBe(true);
  });

  it("PAGES the owner when a restore fails — a log line nobody reads is not a fix", async () => {
    const paged: { title: string }[] = [];
    const s = new PodService(provider, store, {
      environmentsRoot: root, secretVault: vault, onIncident: (i) => paged.push(i),
    });
    const rec = await s.launchPod("u1", "plain", { size: "s", ramCap: Infinity });
    await s.provisionPending();
    await store.update(rec.id, { status: "running" as never, sessionUrl: "wss://mock/session" });
    provider.forceStatus(rec.id, "running");
    await s.setSecret("u1", rec.id, "APIFY_API_TOKEN", "tok-1");
    fileMissing(true);
    provider.injectSecrets = (async () => { throw new Error("incus push refused"); }) as typeof provider.injectSecrets;
    await s.reconcile(rec.id);
    expect(paged).toHaveLength(1);
    expect(paged[0]!.title).toMatch(/repair failed: reinject_secrets/);
  });

  it("does NOT page for a repair that fixes itself next sweep", async () => {
    const paged: unknown[] = [];
    const s = new PodService(provider, store, {
      environmentsRoot: root, secretVault: vault, onIncident: () => paged.push(1),
    });
    const rec = await s.launchPod("u1", "plain", { size: "s", ramCap: Infinity });
    await s.provisionPending();
    await store.update(rec.id, { status: "running" as never, sessionUrl: "wss://mock/session" });
    provider.forceStatus(rec.id, "running");
    fileMissing(false);
    await s.reconcile(rec.id);
    expect(paged).toHaveLength(0);
  });

  it("is throttled — a busy reconcile loop does not exec once per tick", async () => {
    const { s, id } = await podWithSecrets();
    const calls = fileMissing(true);
    for (let i = 0; i < 5; i++) await s.reconcile(id);
    expect(calls.probes).toBe(1);
  });
});
