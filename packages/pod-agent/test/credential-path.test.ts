import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { AgentServer } from "../src/server.js";

/**
 * The server must read the credential path it was CONFIGURED with.
 *
 * `credentialsPathForAgent()` returns an absolute /home/dev path, which is correct on a pod — the
 * pod-agent is PID 1 as root and drops to `dev`, so it cannot use homedir(). But seven call sites
 * reached past the server's own `credPathFor()` straight to that absolute path. On a pod the two
 * always agreed, so nothing ever failed; off a pod the server read whatever happened to sit in
 * /home/dev, which is both wrong and, in a test, a silent read of a real credential file.
 *
 * These tests discriminate ONLY if the configured path is honoured: they point it at a directory
 * that no /home/dev fallback could ever produce.
 */

const servers: AgentServer[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "credpath-"));
  dirs.push(d);
  return d;
}

async function healthz(credPath: string): Promise<{ id: string; authed: boolean }[]> {
  const server = new AgentServer({
    sessionName: `credpath_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    bootCommand: "bash --norc",
    host: "127.0.0.1",
    port: 0,
    tickMs: 500,
    credential: { agent: "claude", path: credPath },
  });
  servers.push(server);
  const { port } = await server.listen();
  const res = await fetch(`http://127.0.0.1:${port}/healthz`);
  const body = (await res.json()) as { agents?: { id: string; authed: boolean }[] };
  return body.agents ?? [];
}

describe("credential path resolution", () => {
  it("reports NOT authed when the configured credential file is absent", async () => {
    // The discriminator. Before credPathFor() was used everywhere this read
    // /home/dev/.claude/.credentials.json — which exists on a dev pod — and reported authed:true
    // for a server explicitly configured to look somewhere empty.
    const agents = await healthz(join(tmp(), "definitely-not-here.json"));
    const claude = agents.find((a) => a.id === "claude");
    expect(claude, "claude should appear: agentsOnPod() includes credential.agent").toBeTruthy();
    expect(claude?.authed).toBe(false);
  });

  it("reports authed when the configured credential file holds a live token", async () => {
    // The other half: proves the first case isn't just "always false".
    const dir = tmp();
    const path = join(dir, "creds.json");
    writeFileSync(
      path,
      JSON.stringify({ claudeAiOauth: { refreshTokenExpiresAt: Date.now() + 30 * 86_400_000 } }),
    );
    const agents = await healthz(path);
    expect(agents.find((a) => a.id === "claude")?.authed).toBe(true);
  });

  /**
   * A structural guard, because the behaviour tests above cannot reach every site.
   *
   * Four of the seven offenders were codex paths (ensureCodexDaemon, codexPairingCode,
   * codexRuntimeMissing) that only run when codex is actually installed on the pod — untestable
   * here, and exactly the ones most likely to be reintroduced by someone adding a fifth.
   *
   * This bug's whole signature is that it never fails loudly: on a pod the absolute path and the
   * configured path agree, so a regression is invisible until a test quietly reads a real
   * credential file. A grep is a blunt instrument, but it is the only thing that fails FIRST.
   */
  it("routes every credential path through credPathFor()", async () => {
    const src = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");
    const direct = src
      .split("\n")
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter((l) => /credentialsPathForAgent\(/.test(l.line))
      // Prose ABOUT the helper is not a call to it — this doc comment explains why the absolute
      // path exists, which is precisely what a future reader needs to keep.
      .filter((l) => !l.line.startsWith("*") && !l.line.startsWith("//"))
      // The single deliberate fallback, inside credPathFor itself.
      .filter((l) => l.line !== ": credentialsPathForAgent(id);");

    expect(
      direct,
      `server.ts must call this.credPathFor(...) instead of credentialsPathForAgent(...) — ` +
        `the latter is an absolute /home/dev path that is only correct on a pod. Offenders: ` +
        direct.map((l) => `line ${l.n}`).join(", "),
    ).toEqual([]);
  });
});
