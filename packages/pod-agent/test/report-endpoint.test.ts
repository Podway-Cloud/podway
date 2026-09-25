import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AgentServer } from "../src/server.js";

const servers: AgentServer[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
  delete process.env.PODWAY_REPORTS_OUTBOX;
  delete process.env.PODWAY_SECRETS_ENV;
});

describe("POST /bug-report (podway bug)", () => {
  it("appends a scrubbed report to the outbox, and rate-limits at 5/hour", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pbreport-"));
    process.env.PODWAY_REPORTS_OUTBOX = path.join(dir, "reports-outbox.jsonl");
    process.env.PODWAY_SECRETS_ENV = path.join(dir, "secrets.env");
    fs.writeFileSync(process.env.PODWAY_SECRETS_ENV, "TUNNEL_TOKEN=very-secret-tunnel-value\n");
    const server = new AgentServer({
      sessionName: `pbreport_${Date.now()}`, bootCommand: "bash --norc", host: "127.0.0.1", port: 0, tickMs: 60_000,
      exitForRestart: () => {},
    } as never);
    servers.push(server);
    const { port } = await server.listen();
    const post = (summary: string) =>
      fetch(`http://127.0.0.1:${port}/bug-report`, { method: "POST", body: JSON.stringify({ summary, area: "startup", detail: "tunnel --token very-secret-tunnel-value" }) });

    const r = await post("prod-tunnel not running after reboot");
    expect(r.status).toBe(200);
    const lines = fs.readFileSync(process.env.PODWAY_REPORTS_OUTBOX, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const rep = JSON.parse(lines[0]!);
    expect(rep).toMatchObject({ summary: "prod-tunnel not running after reboot", area: "startup", source: "agent" });
    expect(typeof rep.id).toBe("string");
    expect(lines[0]).not.toContain("very-secret-tunnel-value");

    for (let i = 0; i < 4; i++) expect((await post(`n${i}`)).status).toBe(200);
    expect((await post("sixth")).status).toBe(429);
    expect((await fetch(`http://127.0.0.1:${port}/bug-report`, { method: "POST", body: "{}" })).status).toBe(400);
  }, 120_000);
});
