import path from "node:path";
import os from "node:os";
import { writeFileSync } from "node:fs";
/**
 * Live-terminal stack for e2e: a REAL pod-agent (tmux, plain shell so a typed
 * command echoes — no Claude CLI needed) + a REAL gateway that authenticates the
 * browser's session (same pg DB + secret as the web app) and proxies to that
 * pod-agent. Run in-process from globalSetup. All workspace imports are dynamic
 * to survive Playwright's CJS config loader.
 */
export interface TerminalStack {
  gatewayUrl: string; // ws://127.0.0.1:<port>
  close: () => Promise<void>;
}

export async function startTerminalStack(opts: {
  dbUrl: string;
  secret: string;
  agentPort: number;
  gatewayPort: number;
  environmentsRoot: string;
}): Promise<TerminalStack> {
  // createAuth/createAppDb read these — the gateway must use the same pg DB.
  process.env.PODWAY_DB = "pg";
  process.env.DATABASE_URL = opts.dbUrl;

  const { AgentServer } = await import("@podway/pod-agent");
  const { GatewayServer } = await import("@podway/gateway");
  const { PodService, DrizzlePodStore } = await import("@podway/control-plane");
  const { FakeProvider } = await import("@podway/provider");
  const { createPgDb } = await import("@podway/db");
  const { createAuth, getSessionUserId } = await import("@podway/auth");

  // A credentials file that EXISTS, so the agent reports `cred.authed` and the
  // gateway records the pod as signed in when a terminal connects. Without it every
  // e2e pod sat forever in the onboarding wizard and no test could ever reach the
  // READY cockpit — which is where most of the UI now lives (found 2026-07-29).
  const fakeCreds = path.join(os.tmpdir(), `podway-e2e-creds-${process.pid}.json`);
  writeFileSync(fakeCreds, JSON.stringify({ e2e: true }));

  const agent = new AgentServer({
    sessionName: `e2e-${process.pid}-${Date.now()}`,
    cwd: process.cwd(),
    env: { HOME: process.env.HOME ?? process.cwd() },
    bootCommand: "bash --norc -i",
    host: "127.0.0.1",
    port: opts.agentPort,
    credential: { agent: "claude-code", path: fakeCreds },
    // In-process: a real process.exit(1) from the session watchdog would kill the whole Playwright
    // run (the sharded-e2e flake, 2026-09-08). A dead session in a test is a test concern, not a
    // reason to take down the runner — so never exit here.
    exitForRestart: () => {},
  });
  await agent.listen();

  // A SECOND agent with NO credential file, so it reports `cred.authed: false`. Onboarding
  // pods (named NO-SESSION) route here, so they hold in the sign-in phase instead of the
  // shared authed agent advancing them straight to ready — that's what lets the onboarding
  // hero / sign-in step be exercised (greeter-frame simulation, area 8).
  const unauthedPort = opts.agentPort + 100; // +1 would collide with the gateway port
  const agentUnauthed = new AgentServer({
    sessionName: `e2e-noauth-${process.pid}-${Date.now()}`,
    cwd: process.cwd(),
    env: { HOME: process.env.HOME ?? process.cwd() },
    bootCommand: "bash --norc -i",
    host: "127.0.0.1",
    port: unauthedPort,
    // no credential → not signed in
    exitForRestart: () => {},
  });
  await agentUnauthed.listen();

  const db = createPgDb(opts.dbUrl);
  const provider = new FakeProvider();
  const control = new PodService(provider, new DrizzlePodStore(db), {
    environmentsRoot: opts.environmentsRoot,
    // long idle so the sweep never sleeps the pod mid-test
  });
  const auth = createAuth({
    BETTER_AUTH_SECRET: opts.secret,
    DATABASE_URL: opts.dbUrl,
    PODWAY_TEST_LOGIN: "1", // satisfies the config guard; gateway only validates
  } as Parameters<typeof createAuth>[0]);

  const gateway = new GatewayServer({
    control,
    authenticate: async (req) => {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string") headers.set(k, v);
      }
      return getSessionUserId(auth, headers);
    },
    // Route a NO-SESSION (onboarding) pod's terminal to the UNAUTHED agent so it stays
    // pre-login; everything else uses the authed agent and reaches ready as before.
    resolveAgentUrl: async (podId: string) => {
      const p = (await provider.getPod(podId).catch(() => null)) as { noSession?: boolean } | null;
      return `ws://127.0.0.1:${p?.noSession ? unauthedPort : opts.agentPort}`;
    },
    host: "127.0.0.1",
    port: opts.gatewayPort,
  });
  await gateway.listen();

  return {
    // MUST be localhost (not 127.0.0.1): the session cookie is scoped to the
    // web app's host `localhost`, and the browser only sends it to that host.
    gatewayUrl: `ws://localhost:${opts.gatewayPort}`,
    close: async () => {
      await gateway.close().catch(() => undefined);
      await agent.close().catch(() => undefined);
      await agentUnauthed.close().catch(() => undefined);
      // End the pg pool before the container is removed, else its idle
      // connections error out ("unexpected postmaster exit").
      await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client
        ?.end?.()
        .catch(() => undefined);
    },
  };
}
