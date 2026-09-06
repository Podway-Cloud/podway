import { describe, it, expect, afterEach } from "vitest";
import { WebSocket } from "ws";
import { AgentServer } from "../src/server.js";
import type { AgentMessage } from "@podway/shared";

const servers: AgentServer[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
});

const uniq = () => `pbsrv_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

async function startServer(
  extra: Partial<ConstructorParameters<typeof AgentServer>[0]> = {},
): Promise<{ server: AgentServer; url: string }> {
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
  return { server, url: `ws://127.0.0.1:${port}` };
}

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function waitForOutput(ws: WebSocket, needle: string, ms = 6000): Promise<void> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onMsg = (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as AgentMessage;
      if (msg.type === "output") {
        buf += msg.data;
        if (buf.includes(needle)) {
          ws.off("message", onMsg);
          resolve();
        }
      }
    };
    ws.on("message", onMsg);
    setTimeout(() => reject(new Error(`timeout for "${needle}"`)), ms);
  });
}

describe("AgentServer (real PTY over WebSocket)", () => {
  it("round-trips input → output (8.1, 4.2)", async () => {
    const { url } = await startServer();
    const ws = await connect(url);
    await new Promise((r) => setTimeout(r, 400));
    ws.send(JSON.stringify({ type: "input", data: "echo srv_ok_42\n" }));
    await waitForOutput(ws, "srv_ok_42");
    ws.close();
  });

  it("mirrors output to two concurrent clients (8.4)", async () => {
    const { url } = await startServer();
    const a = await connect(url);
    const b = await connect(url);
    await new Promise((r) => setTimeout(r, 400));
    a.send(JSON.stringify({ type: "input", data: "echo mirror_777\n" }));
    await Promise.all([waitForOutput(a, "mirror_777"), waitForOutput(b, "mirror_777")]);
    a.close();
    b.close();
  });

  it("answers ping with pong and applies resize (4.2, PTY resize)", async () => {
    const { url } = await startServer();
    const ws = await connect(url);
    const pong = new Promise<void>((resolve) => {
      ws.on("message", (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.type === "pong") resolve();
      });
    });
    ws.send(JSON.stringify({ type: "ping" }));
    await pong;
    // resize should not throw / disconnect
    ws.send(JSON.stringify({ type: "resize", cols: 100, rows: 30 }));
    await new Promise((r) => setTimeout(r, 100));
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it("serves /healthz ready", async () => {
    const { url } = await startServer();
    const httpUrl = url.replace("ws://", "http://") + "/healthz";
    const res = await fetch(httpUrl);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ready).toBe(true);
  });

  // fix/rc-incapable-signin: Claude refuses Remote Control on anything short of a full-scope
  // subscription login, so /healthz's per-agent `rcCapable` must reflect the pod's agentAuth MODE
  // (the greeter option), not just whether a credential file exists — the cockpit's
  // "needs-subscription-signin" affordance (agent-card-state.ts) is driven entirely by this flag.
  describe("/healthz agents[].rcCapable (fix/rc-incapable-signin)", () => {
    it("is false for a Claude agent booted on an inference-only setup-token login", async () => {
      const { url } = await startServer({
        declaredAgents: ["claude-code"],
        credential: { agent: "claude-code", path: "/tmp/pbsrv-nonexistent-creds.json" },
        greeter: { agentAuth: "setup-token" },
      });
      const res = await fetch(url.replace("ws://", "http://") + "/healthz");
      const body = await res.json();
      const claude = body.agents.find((a: { id: string }) => a.id === "claude-code");
      expect(claude.rcCapable).toBe(false);
    });

    it("is false for api-key too", async () => {
      const { url } = await startServer({
        declaredAgents: ["claude-code"],
        credential: { agent: "claude-code", path: "/tmp/pbsrv-nonexistent-creds.json" },
        greeter: { agentAuth: "api-key" },
      });
      const res = await fetch(url.replace("ws://", "http://") + "/healthz");
      const body = await res.json();
      const claude = body.agents.find((a: { id: string }) => a.id === "claude-code");
      expect(claude.rcCapable).toBe(false);
    });

    it("is true for a subscription login (the full-scope OAuth login RC needs)", async () => {
      const { url } = await startServer({
        declaredAgents: ["claude-code"],
        credential: { agent: "claude-code", path: "/tmp/pbsrv-nonexistent-creds.json" },
        greeter: { agentAuth: "subscription" },
      });
      const res = await fetch(url.replace("ws://", "http://") + "/healthz");
      const body = await res.json();
      const claude = body.agents.find((a: { id: string }) => a.id === "claude-code");
      expect(claude.rcCapable).toBe(true);
    });

    it("is true when agentAuth is unknown (no greeter) — back-compat default is capable", async () => {
      const { url } = await startServer({
        declaredAgents: ["claude-code"],
        credential: { agent: "claude-code", path: "/tmp/pbsrv-nonexistent-creds.json" },
      });
      const res = await fetch(url.replace("ws://", "http://") + "/healthz");
      const body = await res.json();
      const claude = body.agents.find((a: { id: string }) => a.id === "claude-code");
      expect(claude.rcCapable).toBe(true);
    });

    it("is always true for codex, regardless of the pod's Claude auth mode", async () => {
      const { url } = await startServer({
        declaredAgents: ["claude-code", "codex"],
        credential: { agent: "claude-code", path: "/tmp/pbsrv-nonexistent-creds.json" },
        greeter: { agentAuth: "setup-token" },
      });
      const res = await fetch(url.replace("ws://", "http://") + "/healthz");
      const body = await res.json();
      const codex = body.agents.find((a: { id: string }) => a.id === "codex");
      expect(codex.rcCapable).toBe(true);
    });
  });
});
