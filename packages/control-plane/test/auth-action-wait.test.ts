import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PodService, AUTH_WAIT } from "../src/service.js";
import { InMemoryPodStore } from "../src/store.js";
import { MockProvider } from "./mock-provider.js";

/**
 * agent-auth-state D7: a sign-in action is done when the POD shows the result, not when the request
 * returned. The wizard closed on "ok" and the cockpit then showed the same "Sign-in expired" (t3tt).
 */
const environmentsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../environments");
let provider: MockProvider;
let svc: PodService;
const saved = { ...AUTH_WAIT };

beforeEach(() => {
  provider = new MockProvider();
  svc = new PodService(provider, new InMemoryPodStore(), { environmentsRoot, defaultProviderName: "incus" });
  AUTH_WAIT.tries = 3;
  AUTH_WAIT.everyMs = 5;
});
afterEach(() => Object.assign(AUTH_WAIT, saved));

async function runningPod() {
  const rec = await svc.launchPod("u", "nextjs-starter");
  await svc.provisionPending();
  return rec.id;
}

describe("reconnectAgent waits for the pod to show a NEW sign-in value", () => {
  it("resolves once the pod shows a new code", async () => {
    const id = await runningPod();
    provider.execStdout = JSON.stringify({ ok: true, agent: "codex" });
    provider.agentStatesResult = [{ id: "codex", window: 1, authed: false, rcActive: false,
      authState: { state: "needs-login", reason: "login-exited" } }];
    const exec = provider.exec.bind(provider);
    provider.exec = async (pid, cmd) => {
      const r = await exec(pid, cmd);
      // the pod prints a fresh code only AFTER the relogin request
      provider.agentStatesResult = [{ id: "codex", window: 1, authed: false, rcActive: false,
        authState: { state: "login-pending", value: "NEWC-12345", issuedAt: 1, expiresAt: Date.now() + 60_000 } }];
      return r;
    };
    await expect(svc.reconnectAgent("u", id, "codex")).resolves.toBeUndefined();
  });

  it("codex now tries the in-session relogin (it used to go straight to wiping auth.json)", async () => {
    const id = await runningPod();
    provider.execStdout = JSON.stringify({ ok: true, agent: "codex" });
    provider.agentStatesResult = [{ id: "codex", window: 1, authed: true, rcActive: true, authState: { state: "signed-in" } }];
    await svc.reconnectAgent("u", id, "codex");
    const cmds = provider.execCalls.map((c) => c.join(" "));
    expect(cmds.some((c) => c.includes("/agent/relogin"))).toBe(true);
    expect(cmds.some((c) => c.includes("rm -f /home/dev/.codex/auth.json"))).toBe(false);
  });

  it("errors when the pod keeps showing the SAME old code (a stale value is not a new login)", async () => {
    const id = await runningPod();
    provider.execStdout = JSON.stringify({ ok: true, agent: "codex" });
    provider.agentStatesResult = [{ id: "codex", window: 1, authed: false, rcActive: false,
      authState: { state: "login-pending", value: "OLDC-12345", issuedAt: 1, expiresAt: Date.now() + 60_000 } }];
    await expect(svc.reconnectAgent("u", id, "codex")).rejects.toThrow(/did not show a new sign-in code/);
  });

  it("errors when the pod never gets past needs-login", async () => {
    const id = await runningPod();
    provider.execStdout = JSON.stringify({ ok: true, agent: "claude-code" });
    provider.agentStatesResult = [{ id: "claude-code", window: 0, authed: false, loginExpired: true, rcActive: false }];
    await expect(svc.reconnectAgent("u", id, "claude-code")).rejects.toThrow(/did not show a new sign-in code/);
  });
});
