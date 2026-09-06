import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import { AgentServer } from "../src/server.js";

const servers: AgentServer[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
});

const uniq = () => `pbrelogin_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

async function start(extra: Partial<ConstructorParameters<typeof AgentServer>[0]> = {}) {
  const server = new AgentServer({
    sessionName: uniq(),
    bootCommand: "bash --norc",
    host: "127.0.0.1",
    port: 0,
    tickMs: 500,
    ...extra,
  });
  servers.push(server);
  const { port } = await server.listen();
  return `http://127.0.0.1:${port}`;
}

async function relogin(base: string, agent?: string) {
  const res = await fetch(`${base}/agent/relogin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(agent ? { agent } : {}),
  });
  return (await res.json()) as { ok: boolean; reason?: string };
}

/**
 * /agent/relogin types `/login` into the LIVE pane so a reconnect never kills the process (a kill
 * ends the remote-control session and claude.ai shows it archived). The endpoint must answer
 * HONESTLY when it cannot do that, because control-plane only skips its respawn fallback on a
 * literal ok:true — a false yes would leave the owner un-renewed with nothing on screen.
 */
describe("/agent/relogin — honest refusal", () => {
  it("refuses for codex: it authenticates via its daemon, not a slash command", async () => {
    const base = await start({ declaredAgents: ["codex"] } as never);
    expect(await relogin(base, "codex")).toEqual({ ok: false, reason: "unsupported-agent" });
  });

  it("does NOT report success when the pane is a plain shell, not a live agent", async () => {
    // A real claude window, but the boot command is bash — so nothing will EVER render "Select
    // login method". The endpoint types, waits for the menu, does not get one, and must answer
    // ok:false so control-plane falls back to respawning instead of believing a login was renewed.
    // This is the case pane-sniffing alone would miss: a bare shell carries no exit marker, so
    // agentGone() says "present". Awaiting the menu is what actually catches it.
    const creds = path.join(os.tmpdir(), `pbcred_${Date.now()}.json`);
    const base = await start({ credential: { agent: "claude-code", path: creds } } as never);
    await new Promise((r) => setTimeout(r, 2000)); // let a tick assign the agent window
    const r = await relogin(base, "claude-code");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("login-menu-absent");
  }, 60_000);
});
