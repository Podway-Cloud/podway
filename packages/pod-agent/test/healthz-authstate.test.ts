import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { AgentServer } from "../src/server.js";

const servers: AgentServer[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
});

const DAY = 86_400_000;

async function authState(extra: Record<string, unknown>, expiresAt: number | null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pbauthstate-"));
  const creds = path.join(dir, ".credentials.json");
  if (expiresAt != null)
    fs.writeFileSync(creds, JSON.stringify({ claudeAiOauth: { accessToken: "t", refreshToken: "t", refreshTokenExpiresAt: expiresAt } }));
  const server = new AgentServer({
    sessionName: `pbauthstate_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    bootCommand: "bash --norc",
    host: "127.0.0.1",
    port: 0,
    tickMs: 300,
    exitForRestart: () => {},
    credential: { agent: "claude-code", path: creds },
    ...extra,
  } as never);
  servers.push(server);
  const { port } = await server.listen();
  const h = (await (await fetch(`http://127.0.0.1:${port}/healthz`)).json()) as {
    agents?: { id: string; authState?: { state: string; reason?: string } }[];
  };
  return h.agents?.find((a) => a.id === "claude-code")?.authState;
}

/** agent-auth-state task 2.5: /healthz carries ONE classified state per agent, so the cockpit stops
 * re-deriving sign-in from half a dozen raw fields (the source of ~20 point fixes). */
describe("/healthz authState", () => {
  it("valid credentials → signed-in", async () => {
    expect(await authState({}, Date.now() + 30 * DAY)).toEqual({ state: "signed-in" });
  }, 20_000);

  it("expired credentials → needs-login(expired)", async () => {
    expect(await authState({}, Date.now() - DAY)).toEqual({ state: "needs-login", reason: "expired" });
  }, 20_000);

  it("no credentials → needs-login(never)", async () => {
    expect(await authState({}, null)).toEqual({ state: "needs-login", reason: "never" });
  }, 20_000);

  it("setup-token while Podway (not T3) drives the pod → wrong-mode", async () => {
    expect(await authState({ greeter: { agentAuth: "setup-token" } }, null)).toEqual({ state: "wrong-mode" });
  }, 20_000);
});
