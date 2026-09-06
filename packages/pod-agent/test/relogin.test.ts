import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
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

  it("sends the sign-in code to the SAME window that shows the prompt", () => {
    // The login lives in a dedicated `signin` window so an autonomous agent cannot type over the
    // owner's prompt. But /agent/input kept typing into the AGENT's window, so a pasted code went to
    // a pane that was not asking while the prompt waited in the other one — the cockpit sat on
    // "Signing in…" forever (test:1, 2026-09-06, after the link itself finally worked).
    //
    // The rule this pins down: moving where a prompt LIVES means moving the input that answers it.
    // Asserted on the source because both halves are private tmux plumbing with no endpoint to probe.
    const src = fs.readFileSync(new URL("../src/server.ts", import.meta.url).pathname, "utf8");
    const input = src.indexOf('req.url === "/agent/input"');
    expect(input).toBeGreaterThan(-1);
    // the window chosen inside /agent/input must consult the signin window first
    const after = src.slice(input, input + 2500);
    expect(after).toContain("windowIndexByName(AgentServer.SIGNIN_WINDOW)");
  });


  it("marks the reconnect IN FLIGHT so the sign-in link can be published", () => {
    // The bug that survived every OTHER reauth fix and kept the cockpit spinning: the in-flight
    // marker was written into /agent/restart instead of /agent/relogin, because the anchor used to
    // place it appears in BOTH endpoints. Everything else worked — the signin window opened and the
    // full OAuth URL printed in it — but the health tick still deleted the captured link on every
    // pass, since it only publishes for a pod that is NOT signed in unless a reconnect is in flight.
    //
    // Asserted against the SOURCE because the marker is private state with no endpoint of its own,
    // and the failure is purely one of WIRING: right code, wrong handler.
    const src = fs.readFileSync(new URL("../src/server.ts", import.meta.url).pathname, "utf8");
    const relogin = src.indexOf('req.url === "/agent/relogin"');
    const marker = src.indexOf("this.reconnectInFlight.set(");
    expect(relogin).toBeGreaterThan(-1);
    expect(marker).toBeGreaterThan(relogin);
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
