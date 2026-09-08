import { readFileSync, rmSync } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";

const STATE = path.join(process.cwd(), ".e2e-state.json");

/** Kill the Next server (process group) and remove the Postgres container. */
export default async function globalTeardown(): Promise<void> {
  // Tests have already passed by now. Teardown tears down a LIVE stack (kill the Next server,
  // close the in-process gateway/pod-agent, drop the db, remove the container) and that inherently
  // throws connection errors — and NOT only pg-churn: under the 2-shard concurrent load a Node
  // stream `aborted`/TypeError surfaces here too, and global-setup's STRICT uncaughtException handler
  // (which rethrows anything non-churn) then crashes a run whose tests ALL PASSED (observed 2026-09-08:
  // 53/53 green, then exit 1 at teardown). Nothing that happens after the last test should fail the
  // run — drop setup's strict handlers and swallow everything from here on.
  process.removeAllListeners("uncaughtException");
  process.removeAllListeners("unhandledRejection");
  process.on("uncaughtException", () => {});
  process.on("unhandledRejection", () => {});

  let state: {
    containerId?: string;
    serverPid?: number;
    externalPg?: string;
    dbName?: string;
  } = {};
  try {
    state = JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    return;
  }
  // Kill the web server first (its pg pool dies with the process), then the
  // in-process stack, THEN remove the container last.
  if (state.serverPid) {
    try {
      process.kill(-state.serverPid, "SIGTERM"); // detached → kill the group
    } catch {
      /* already gone */
    }
  }
  const stack = (globalThis as Record<string, unknown>).__e2eTerminalStack as
    | { close: () => Promise<void> }
    | undefined;
  if (stack) await stack.close().catch(() => undefined);
  await new Promise((r) => setTimeout(r, 300)); // let sockets settle

  // External Postgres: drop the throwaway database this run created.
  if (state.externalPg && state.dbName) {
    try {
      const { Client } = await import("pg");
      const c = new Client({ connectionString: state.externalPg });
      await c.connect();
      await c.query(`DROP DATABASE IF EXISTS ${state.dbName} WITH (FORCE)`);
      await c.end();
    } catch {
      /* best-effort: a leftover e2e db is harmless and named obviously */
    }
  }

  if (state.containerId) {
    // Graceful stop (SIGTERM → clean Postgres shutdown) then remove, to minimise
    // connection-reset churn versus `rm -f` (SIGKILL).
    await new Promise<void>((r) => execFile("docker", ["stop", state.containerId!], () => r()));
    await new Promise<void>((r) => execFile("docker", ["rm", "-f", state.containerId!], () => r()));
  }
  rmSync(STATE, { force: true });
}
