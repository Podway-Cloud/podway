import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { AgentServer } from "../src/server.js";

const servers: AgentServer[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
});

const DAY = 86_400_000;
// Built from pieces: the literal on screen trips the LIVE pod-agent watchdog on a dev pod.
const ERRLINE = ["Log" + "in exp" + "ired", "Please run /log" + "in"].join(" · ");
const writeCreds = (p: string, expiresAt: number) =>
  fs.writeFileSync(p, JSON.stringify({ claudeAiOauth: { accessToken: "t", refreshToken: "t", refreshTokenExpiresAt: expiresAt } }));

async function until(fn: () => Promise<boolean> | boolean, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/**
 * The t3tt bug (agent-auth-state task 2.4, 2026-09-24): the owner renews Claude in the signin window,
 * the new credential lands — and the cockpit STILL says "Sign-in expired". The agent's own pane keeps
 * the old "session ended" error text on screen, the pane watchdog keeps reading it as a
 * live failure, and maybeRespawnAuthed refuses to respawn while that flag is up. Deadlock: the only
 * thing that would clear the text (a respawn) is gated on the text being gone.
 */
describe("a relogin that LANDS clears the stale pane failure", () => {
  it("respawns the agent and stops reporting needsReauth", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pblanded-"));
    const creds = path.join(dir, ".credentials.json");
    const oldExpiry = Date.now() + 10 * DAY;
    writeCreds(creds, oldExpiry); // file looks fine — the failure is only on the pane (the t3tt shape)
    const sessionName = `pblanded_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const server = new AgentServer({
      sessionName,
      bootCommand: `bash --norc -c 'echo "${ERRLINE}"; sleep 600'`,
      host: "127.0.0.1",
      port: 0,
      tickMs: 300,
      exitForRestart: () => {},
      credential: { agent: "claude-code", path: creds },
      authedRespawn: { credsPath: creds, command: `bash --norc -c 'echo RESPAWNED-OK; sleep 600'` },
    } as never);
    servers.push(server);
    const { port } = await server.listen();
    const needsReauth = async () => {
      const h = (await (await fetch(`http://127.0.0.1:${port}/healthz`)).json()) as { agents?: { id: string; needsReauth?: boolean }[] };
      return h.agents?.find((a) => a.id === "claude-code")?.needsReauth === true;
    };
    expect(await until(needsReauth)).toBe(true);

    // The owner's relogin is in flight (as /agent/relogin records it), then the new login lands.
    (server as unknown as { reconnectInFlight: Map<string, unknown> }).reconnectInFlight.set("claude-code", {
      startedAt: Date.now(),
      baseExpiry: oldExpiry,
    });
    writeCreds(creds, Date.now() + 30 * DAY);

    const pane = () => execFileSync("tmux", ["capture-pane", "-p", "-t", `${sessionName}:0`], { encoding: "utf8" });
    expect(await until(() => pane().includes("RESPAWNED-OK"))).toBe(true);
    expect(await until(async () => !(await needsReauth()))).toBe(true);
  }, 45_000);

  it("a pane-only false alarm (credential never changed) does NOT respawn the working agent", async () => {
    // podway dev, 2026-09-24: the agent's own chat showed the error words, the flag went up, the words
    // scrolled away — and the "recovery" respawn killed a live session (claude.ai archived it).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pbfalse-"));
    const creds = path.join(dir, ".credentials.json");
    writeCreds(creds, Date.now() + 10 * DAY);
    const sessionName = `pbfalse_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const server = new AgentServer({
      sessionName,
      bootCommand: `bash --norc -c 'echo "${ERRLINE}"; sleep 3; clear; echo STILL-WORKING; sleep 600'`,
      host: "127.0.0.1",
      port: 0,
      tickMs: 300,
      exitForRestart: () => {},
      credential: { agent: "claude-code", path: creds },
      authedRespawn: { credsPath: creds, command: `bash --norc -c 'echo RESPAWNED-BAD; sleep 600'` },
    } as never);
    servers.push(server);
    const { port } = await server.listen();
    const needsReauth = async () => {
      const h = (await (await fetch(`http://127.0.0.1:${port}/healthz`)).json()) as { agents?: { id: string; needsReauth?: boolean }[] };
      return h.agents?.find((a) => a.id === "claude-code")?.needsReauth === true;
    };
    expect(await until(needsReauth)).toBe(true);
    expect(await until(async () => !(await needsReauth()))).toBe(true);
    await new Promise((r) => setTimeout(r, 3000)); // several ticks for a respawn to (wrongly) happen
    const pane = execFileSync("tmux", ["capture-pane", "-p", "-t", `${sessionName}:0`], { encoding: "utf8" });
    expect(pane).toContain("STILL-WORKING");
    expect(pane).not.toContain("RESPAWNED-BAD");
  }, 45_000);
});
