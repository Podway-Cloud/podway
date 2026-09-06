import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { AgentServer } from "../src/server.js";

/**
 * The RECONNECT PATH, end to end.
 *
 * Seven separate bugs shipped in this flow because it had never been run in one piece — each was
 * only visible once the previous was fixed, so the owner surfaced them one per attempt across an
 * afternoon. Every individual piece had passing tests; what nothing exercised was the PATH.
 *
 * So this drives the whole thing against a fake `claude` that reproduces the real CLI's awkward
 * habits, and asserts at each junction:
 *
 *   1. /agent/relogin opens a sign-in window without killing the agent
 *   2. the sign-in URL reaches /healthz — even though a valid credential still exists
 *   3. that URL is COMPLETE, including the trailing &state= on a space-padded final row
 *   4. a code posted to /agent/input reaches the window that is ASKING for it
 *   5. the credential is replaced
 *   6. the sign-in window is retired, leaving no stray tab
 *
 * Junctions 2, 4 and 6 are where the last three bugs lived, and none of them were logic errors:
 * they were two halves of the system disagreeing about where something lived.
 */

const servers: AgentServer[] = [];
const tmpDirs: string[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close().catch(() => undefined);
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const uniq = () => `rc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * A fake `claude` that behaves like the real one in the ways that BROKE us:
 *
 *  - prints the login method menu, so the menu-walk has something to accept
 *  - hard-wraps the OAuth URL across rows, with the LAST row short and SPACE-PADDED — the exact
 *    shape that made the rejoin drop `&state=` and the URL read as incomplete forever
 *  - sits on "Paste code here if prompted >" until something types
 *  - on a code, writes the credential and ends on "Login successful. Press Enter to continue…",
 *    waiting for a keypress nobody sends — which is what left a stray window behind
 */
function fakeClaude(dir: string, credPath: string): string {
  const bin = path.join(dir, "claude");
  fs.writeFileSync(
    bin,
    `#!/bin/sh
if [ "$1" = "/login" ] || [ "$1" = "login" ]; then
  echo "Login"
  echo "Select login method:"
  echo "  1. Claude account with subscription"
  read -r _choice
  echo "Browser didn't open? Use the url below to sign in (c to copy)"
  printf '%s\\n' "https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88"
  printf '%s\\n' "ed-5944d1962f5e&response_type=code&redirect_uri=https%%3A%%2F%%2Fplatform.claude.co"
  printf '%s\\n' "m%%2Foauth%%2Fcode%%2Fcallback&scope=org%%3Acreate_api_key&code_challenge=abc123"
  # the final row is SHORT and PADDED — the shape that used to lose &state=
  printf '%s      \\n' "&state=zzz999"
  echo "   Paste code here if prompted >"
  read -r code
  printf '{"claudeAiOauth":{"accessToken":"new","refreshToken":"new","refreshTokenExpiresAt":%s}}' \\
    "$(( $(date +%s) * 1000 + 2592000000 ))" > "${credPath}"
  echo "Login successful. Press Enter to continue…"
  read -r _ack
  sleep 300
  exit 0
fi
# Not a login: behave like the agent TUI at rest. The frame matters — liveness is judged by a
# POSITIVE test for an agent UI, because a bare shell trips none of the negative checks (no exit
# marker, no gate) and a reconnect beside a dead agent must still report failure.
echo "────────────────────────────────────────────"
echo "  ⏵⏵ bypass permissions on (shift+tab to cycle)"
sleep 300
`,
    { mode: 0o755 },
  );
  return bin;
}

async function healthz(base: string) {
  const r = await fetch(`${base}/healthz`);
  return (await r.json()) as { agents?: { id: string; authUrl?: string | null }[] };
}

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("the reconnect path, end to end", () => {
  it("carries a sign-in from request to fresh credential, leaving no window behind", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rcpath-"));
    tmpDirs.push(dir);
    const credPath = path.join(dir, "credentials.json");
    // A credential that is VALID but expiring — the case where the link used to be withheld,
    // because every gate keyed on the file being ABSENT.
    fs.writeFileSync(
      credPath,
      JSON.stringify({
        claudeAiOauth: { refreshTokenExpiresAt: Date.now() + 3 * 24 * 3600 * 1000 },
      }),
    );
    fakeClaude(dir, credPath);
    process.env.PATH = `${dir}:${process.env.PATH}`;

    const session = uniq();
    const server = new AgentServer({
      sessionName: session,
      bootCommand: `${dir}/claude --agent`,
      host: "127.0.0.1",
      port: 0,
      tickMs: 400,
      credential: { agent: "claude-code", path: credPath },
    } as never);
    servers.push(server);
    const { port } = await server.listen();
    const base = `http://127.0.0.1:${port}`;
    await settle(2500); // let a tick assign the agent window

    // 1. ask for a reconnect
    const r = await fetch(`${base}/agent/relogin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent: "claude-code" }),
    });
    const body = (await r.json()) as { ok: boolean; reason?: string };
    expect(`${body.ok} ${body.reason ?? ""}`.trim(), "relogin refused").toBe("true");

    // 2 + 3. the sign-in URL must reach healthz, COMPLETE, despite a valid credential existing
    let url: string | null | undefined;
    for (let i = 0; i < 30 && !url; i++) {
      await settle(500);
      url = (await healthz(base)).agents?.find((a) => a.id === "claude-code")?.authUrl;
    }
    expect(url, "no sign-in URL was ever published").toBeTruthy();
    expect(url).toContain("redirect_uri=");
    expect(url, "the padded final row was dropped — &state= is missing").toContain("&state=zzz999");
    expect(url).not.toMatch(/\s/);

    // 4 + 5. a code posted to /agent/input must reach the window that is asking
    const before = fs.readFileSync(credPath, "utf8");
    await fetch(`${base}/agent/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent: "claude-code", text: "the-code" }),
    });
    let after = before;
    for (let i = 0; i < 30 && after === before; i++) {
      await settle(500);
      after = fs.readFileSync(credPath, "utf8");
    }
    expect(after, "the code never reached the window showing the prompt").not.toBe(before);
    expect(after).toContain("new");

    // 6. and the sign-in window must not be left behind
    let windows = "";
    for (let i = 0; i < 20; i++) {
      await settle(500);
      windows = execFileSync("tmux", ["list-windows", "-t", session, "-F", "#{window_name}"], {
        encoding: "utf8",
      }).trim();
      if (!windows.includes("signin")) break;
    }
    expect(windows, "a stray signin window was left behind").not.toContain("signin");
  }, 120_000);
});
