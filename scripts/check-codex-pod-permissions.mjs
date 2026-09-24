#!/usr/bin/env node
// Exercise the installed managed daemon, without credentials, model calls, or touching the live daemon.
// Run on a pod: node scripts/check-codex-pod-permissions.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(new URL("../packages/pod-agent/package.json", import.meta.url));
const WebSocket = require("ws");
const binary = process.env.CODEX_STANDALONE_TEST_BIN ?? path.join(homedir(), ".codex/packages/standalone/current/codex");
const init = readFileSync(new URL("../packages/provider/pod-base/init.sh", import.meta.url), "utf8");
const block = init.split(">>> podway:codex-config-seed")[1].split("<<< podway:codex-config-seed")[0];
const heredoc = block.split("<<'PY'")[1];
const seed = heredoc.slice(heredoc.indexOf("\n") + 1).split("\nPY")[0];

function run(command, args, env) {
  const result = spawnSync(command, args, { env, encoding: "utf8", timeout: 20_000 });
  assert.equal(result.status, 0, `${command}: ${result.stderr || result.error || result.stdout}`);
  return result.stdout;
}

async function check(seeded) {
  // Codex refuses helper binaries under /tmp, so use an isolated directory in home.
  const dir = mkdtempSync(path.join(homedir(), ".podway-codex-permission-check-"));
  const env = { ...process.env, CODEX_HOME: dir };
  delete env.OPENAI_API_KEY;
  delete env.OPENAI_BASE_URL;
  let ws;
  try {
    const install = path.join(dir, "packages/standalone/current");
    mkdirSync(install, { recursive: true });
    symlinkSync(binary, path.join(install, "codex"));
    if (seeded) run("python3", ["-c", seed], { ...env, PODWAY_CODEX_TOML: path.join(dir, "config.toml") });
    const started = JSON.parse(run(binary, ["app-server", "daemon", "start"], env));
    // No remote-control enrollment; this is a local-only instance using the same managed daemon.
    ws = new WebSocket(`ws+unix:${started.socketPath}:/upgrade`, { perMessageDeflate: false });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("daemon connection timed out")), 10_000);
      ws.once("open", () => { clearTimeout(timer); resolve(); });
      ws.once("error", (err) => { clearTimeout(timer); reject(err); });
    });
    let nextId = 0;
    const rpc = (method, params) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { ws.off("message", receive); reject(new Error(`${method} timed out`)); }, 10_000);
      const receive = (data) => {
        const message = JSON.parse(data.toString());
        if (message.id !== id) return;
        clearTimeout(timer);
        ws.off("message", receive);
        message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
      };
      ws.on("message", receive);
      ws.send(JSON.stringify({ id, method, params }));
    });
    await rpc("initialize", { clientInfo: { name: "podway_permissions_check", version: "1" } });
    ws.send(JSON.stringify({ method: "initialized", params: {} }));
    const { config } = await rpc("config/read", { includeLayers: false });
    const command = await rpc("command/exec", {
      command: ["/bin/sh", "-c", "printf pod-command-ok"], cwd: dir,
    });
    console.log(JSON.stringify({ seeded, approval: config.approval_policy, sandbox: config.sandbox_mode, command }));
    if (seeded) {
      assert.equal(config.approval_policy, "never");
      assert.equal(config.sandbox_mode, "danger-full-access");
      assert.equal(command.exitCode, 0);
      assert.equal(command.stdout, "pod-command-ok");
      // Creating an ephemeral thread doesn't call a model, but proves the session defaults too.
      const thread = await rpc("thread/start", { cwd: dir, ephemeral: true });
      assert.equal(thread.approvalPolicy, "never");
      assert.equal(thread.sandbox.type, "dangerFullAccess");
    }
  } finally {
    ws?.terminate();
    // Keep diagnostic state if stop fails; don't orphan a daemon by removing its pid/config files.
    run(binary, ["app-server", "daemon", "stop"], env);
    rmSync(dir, { recursive: true, force: true });
  }
}

await check(false);
await check(true);
console.log("Codex managed-daemon pod permissions: PASS (temporary daemons cleaned up)");
