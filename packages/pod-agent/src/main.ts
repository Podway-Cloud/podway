import { execFile, execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, renameSync, chownSync } from "node:fs";
import path from "node:path";
import { createLogger } from "@podway/shared/log";
import { AgentServer } from "./server.js";
import { startScheduler } from "./scheduler.js";
import { autopilotTick, sh } from "./autopilot.js";
import { sessionStateFromDisk, lastAgentActivityMs, newestClaudeTranscript, agentWindowTarget } from "./signals.js";
import { startCacheTrim } from "./cache-trim.js";
import {
  bootCommandForAgent,
  credentialsPathForAgent,
  sanitizeSessionName,
  KICKOFF_PATH,
  KICKOFF_TRIGGER,
  RESUME_TRIGGER,
  DEFAULT_PERMISSION_MODE,
  normalizeAgentAuth,
  type AgentAuth,
} from "./boot.js";
import { parseOomKills } from "./oom.js";
import { attributeRestartToOom, composeResumeNudge, openInboxCount, withUnreadMessages } from "./incident-nudge.js";

const log = createLogger("pod-agent");

/**
 * The resume nudge, enriched with a Podway system notice when THIS restart was caused
 * by an agent OOM (design.md §3 — the primary owner channel). Best-effort: any failure
 * to read dmesg/uptime/spec falls back to the plain nudge, never blocking boot.
 */
function resumeNudge(): string {
  const unread = openInboxCount(
    process.env.PODWAY_MSG_INBOX ?? "/home/dev/.podway/msg-inbox.jsonl",
    process.env.PODWAY_MSG_DONE ?? "/home/dev/.podway/msg-done",
  );
  return withUnreadMessages(oomResumeNudge(), unread);
}

function oomResumeNudge(): string {
  try {
    const dmesg = execFileSync("dmesg", { encoding: "utf8", maxBuffer: 8_000_000 });
    const uptimeSec = Number(readFileSync("/proc/uptime", "utf8").split(" ")[0]) || 0;
    const attribution = attributeRestartToOom(parseOomKills(dmesg), uptimeSec, (c) =>
      /claude|codex/i.test(c),
    );
    if (attribution) {
      log.info("resume_oom_attributed", { victim: attribution.victim, loop: attribution.loop });
    }
    const cockpitUrl = readSpec().cockpitUrl;
    return composeResumeNudge(RESUME_TRIGGER, attribution, typeof cockpitUrl === "string" ? cockpitUrl : null);
  } catch {
    return RESUME_TRIGGER;
  }
}

/**
 * Pod entrypoint: run first-boot seeding (podway-init), then serve the terminal.
 */
async function main(): Promise<void> {
  // First-boot seeding from sandbox-provider (idempotent via its marker).
  if (existsSync("/usr/local/bin/podway-init")) {
    try {
      // PID 1 inherits no PATH, so pass a known-good one — otherwise init's
      // `python3`/`iptables` steps silently fail to resolve. (init.sh also sets
      // PATH itself; this is belt-and-suspenders for anything it execs.)
      execFileSync("/usr/local/bin/podway-init", {
        stdio: "inherit",
        env: { ...process.env, PATH: process.env.PATH || "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" },
      });
    } catch (e) {
      log.error("init_failed", { err: e });
    }
  }

  const agent = readAgent();
  const mode = readPermissionMode();
  // The auth mode is read FRESH at every use (agent-auth-state D6): it changes at runtime (Renew,
  // revert-to-subscription) and a value frozen at pod-agent start booted the wrong login command.
  const sessionName = readSessionName();
  // The pod's unprivileged user owns the home volume. pod-agent runs as root
  // only to seed (podway-init above); the shell must run as `dev` so ~/.claude,
  // ~/work, and login state land on the persistent /home/dev volume.
  const home = "/home/dev";
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  const server = new AgentServer({
    sessionName: "main",
    cwd: path.join(home, "work"),
    // Put the dev-writable npm prefix FIRST on PATH so `podway agent update` takes effect:
    // it installs the agent CLIs into ~/.npm-global as dev (the baked ones under /usr are
    // root-owned and un-updatable), and the updated claude/codex must SHADOW them for the
    // agent this pod-agent launches. Persists on the home volume across restarts.
    env: {
      HOME: home,
      USER: "dev",
      PATH: `${home}/.npm-global/bin:${process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"}`,
    },
    uid: isRoot ? 1000 : undefined,
    gid: isRoot ? 1000 : undefined,
    bootCommand: bootCommandForAgent(agent, mode, readAgentAuth()),
    credential: { agent, path: credentialsPathForAgent(agent) },
    // Adding an agent to a LIVE pod (slice 3): main.ts owns the pod-spec, so it
    // builds the command. The ADDED agent joins a worked-in pod, so this is the
    // boot (resume) path — never the first-run kickoff, which would re-greet.
    agentCommandFor: (a: string) => bootCommandForAgent(a, mode, readAgentAuth()),
    // The declared shape the watchdog repairs toward.
    declaredAgents: readAgents(),
    // Same name Claude uses for its RC session title, so the Codex app, the Claude
    // app and the dashboard all call this pod the same thing.
    displayName: readSessionName(),
    // Login→respawn: after the owner re-auths an unauthenticated boot (e.g. the ~30-day login
    // expiry), respawn the window with the FULL boot command — which `--continue`s the prior
    // transcript when one exists (bootCommandForAgent's guard), and the greeter still fires the
    // right kickoff/resume trigger off the greeted-marker. Using the plain kickoff command here
    // was a real bug: it started a BRAND-NEW session on every login renewal, dropping the owner's
    // conversation (reported as "reconnect = empty session", independent of the podbay→podway
    // rename). Only wire it when the env declares a kickoff — otherwise a respawn gains nothing.
    authedRespawn: existsSync(KICKOFF_PATH)
      ? {
          credsPath: credentialsPathForAgent(agent),
          get command() {
            return bootCommandForAgent(agent, mode, readAgentAuth());
          },
        }
      : undefined,
    // Greeter (claude only): enable remote control (titled with the pod's
    // display name) + type the kickoff trigger, verified (greeter.ts).
    greeter:
      agent !== "codex"
        ? {
            rcTitle: sanitizeSessionName(sessionName),
            get agentAuth() {
              return readAgentAuth();
            },
            kickoffTrigger: existsSync(KICKOFF_PATH) ? KICKOFF_TRIGGER : undefined,
            // Cold restart of an already-greeted pod: nudge the resumed agent so it orients instead of
            // sitting silent in a seemingly-empty session (when the restart was an OOM, the nudge leads
            // with an owner-facing notice). ALWAYS provided — NOT gated on a kickoff — so a pod with no
            // kickoff still gets the nudge on restart instead of resuming silently (owner: first10 got
            // the handoff note but never the "Resuming — where are we?" turn, 2026-08-26).
            resumeTrigger: resumeNudge(),
          }
        : undefined,
    host: process.env.PODWAY_AGENT_HOST ?? "::",
    port: Number(process.env.PODWAY_AGENT_PORT ?? 8080),
  });
  const { host, port } = await server.listen();
  log.info("listening", { host, port, agent, uid: isRoot ? 1000 : "self" });

  // ADDED agents (spec.agents beyond the primary) get their windows respawned on
  // every boot. Without this, an image update / restart silently DROPPED them:
  // the recreate preserved the spec but only the primary's session was rebuilt,
  // leaving the DB claiming an agent the pod didn't run (live find, pod "ttt",
  // 2026-07-29). spawnAgentWindow is idempotent by window name, so this is safe
  // on every start. Boot = the resume path — never the first-run kickoff.
  const extraAgents = readAgents().slice(1);
  if (extraAgents.length > 0) {
    const { spawnAgentWindow } = await import("./signals.js");
    for (const a of extraAgents) {
      spawnAgentWindow("main", a, bootCommandForAgent(a, mode, readAgentAuth()), {
        uid: isRoot ? 1000 : undefined,
        gid: isRoot ? 1000 : undefined,
      })
        .then((w) => log.info("added_agent_respawned", { agent: a, window: w }))
        .catch((e) => log.warn("added_agent_respawn_failed", { agent: a, err: String(e) }));
    }
  }

  // Recurring scheduled JOBS (morning-ops-robot / operations bot). Started
  // unconditionally: it no-ops unless a jobs config exists (only that playbook
  // writes one), injecting each due job's run turn into the same "main" session
  // as the greeter, gated on the agent being idle. Config + bookkeeping + run log
  // live in ~/.podway — on the persistent /home/dev volume (a restart keeps them)
  // but OUTSIDE the ~/work git tree, where a reset/checkout/clean (BYO repos don't
  // gitignore .podway) would corrupt live schedule state. Migrated from the old
  // ~/work/.podway location on first boot after this ships.
  const opsDir = path.join(home, ".podway");
  try {
    mkdirSync(opsDir, { recursive: true });
    if (isRoot) chownSync(opsDir, 1000, 1000);
    const oldOpsDir = path.join(home, "work", ".podway");
    for (const f of ["ops-jobs.json", "ops-state.json", "ops-runs.jsonl"]) {
      const from = path.join(oldOpsDir, f);
      const to = path.join(opsDir, f);
      if (existsSync(from) && !existsSync(to)) renameSync(from, to); // same volume ⇒ atomic, keeps owner
    }
  } catch {
    /* best-effort: a fresh pod has nothing to migrate */
  }
  if (isRoot) startCacheTrim(log); // guest-memory-return: idle pods hand cache back to the box
  // Codex's built-in self-updater adds a ~350 MB release every few days and never prunes; podway's prune
  // only ran on `podway agent update codex`, so podway dev held 22 dead builds (6.9 GB, 2026-10-01).
  const pruneCodex = () =>
    // HOME: a systemd service has none, and `podway` (set -u) dies on it — the first ship pruned nothing.
    execFile("podway", ["__prune-codex-releases"], { uid: isRoot ? 1000 : undefined, gid: isRoot ? 1000 : undefined, timeout: 60_000, env: { ...process.env, HOME: home } }, () => undefined);
  setTimeout(pruneCodex, 5 * 60_000).unref();
  setInterval(pruneCodex, 6 * 3_600_000).unref();
  startScheduler({
    sessionName: "main",
    jobsPath: path.join(opsDir, "ops-jobs.json"),
    statePath: path.join(opsDir, "ops-state.json"),
    runsLogPath: path.join(opsDir, "ops-runs.jsonl"),
    uid: isRoot ? 1000 : undefined,
    gid: isRoot ? 1000 : undefined,
  });

  // Autopilot (owner, 2026-10-11): wake-to-work + opt-in "always choose recommended" — both off unless the
  // owner turned them on in the cockpit (pod-spec relentless.wake / relentless.autopick). See autopilot.ts.
  const asDev = { uid: isRoot ? 1000 : undefined, gid: isRoot ? 1000 : undefined };
  const tmuxTarget = () => agentWindowTarget("main", asDev);
  let ticking = false;
  setInterval(() => {
    if (ticking) return;
    ticking = true;
    void autopilotTick({
      now: Date.now,
      spec: () => {
        const r = (readSpec().relentless ?? {}) as { wake?: unknown; autopick?: unknown };
        return { wake: r.wake === true, autopick: r.autopick === true };
      },
      status: sessionStateFromDisk,
      idleMs: () => lastAgentActivityMs(),
      transcript: () => {
        const f = newestClaudeTranscript(path.join(home, "work"));
        try {
          return f ? readFileSync(f, "utf8") : "";
        } catch {
          return "";
        }
      },
      screen: async () => sh("tmux", ["capture-pane", "-p", "-t", await tmuxTarget()], asDev),
      // Did a wake lead to work? git HEAD + dirty files; for a ~/work that is not a git repo (many app
      // pods), the newest file changes instead — otherwise every wake looks empty and waking pauses after 2.
      workMarker: async () => {
        const w = path.join(home, "work");
        const git = (await sh("git", ["-C", w, "rev-parse", "HEAD"], asDev)) + (await sh("git", ["-C", w, "status", "--porcelain"], asDev));
        if (git) return git;
        return sh("bash", ["-c", "find \"$1\" -xdev -maxdepth 4 -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -printf '%T@ %p\\n' 2>/dev/null | sort -n | tail -20", "_", w], asDev);
      },
      inject: async (text) => {
        const t = await tmuxTarget();
        await sh("tmux", ["send-keys", "-t", t, "-l", text], asDev);
        await new Promise((r) => setTimeout(r, 400));
        await sh("tmux", ["send-keys", "-t", t, "Enter"], asDev);
      },
      enter: async () => void (await sh("tmux", ["send-keys", "-t", await tmuxTarget(), "Enter"], asDev)),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      statePath: path.join(home, ".podway", "autopilot.json"),
    })
      .catch((e) => log.warn("autopilot_tick_failed", { err: e instanceof Error ? e.message : String(e) }))
      .finally(() => {
        ticking = false;
      });
  }, 30_000).unref();

  // Stop FAST. server.close() alone waits for every open connection to end — an open web terminal
  // (WebSocket) or a keep-alive client never does — so systemd waited out its 90 s stop timeout
  // and SIGKILLed us: the bulk of an update's downtime (measured 2026-10-13: 32 s in an update,
  // 90 s for a plain stop). Drop open connections and exit within 3 s whatever happens.
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      setTimeout(() => process.exit(0), 3_000).unref();
      void server.close().finally(() => process.exit(0));
    });
  }
}

function readSpec(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync("/etc/podway/pod-spec.json", "utf8"));
  } catch {
    return {};
  }
}

function readPermissionMode(): string {
  const perms = readSpec().permissions as { mode?: string } | undefined;
  return perms?.mode ?? DEFAULT_PERMISSION_MODE;
}

/** How this pod authenticates its agent — from the pod-spec (see normalizeAgentAuth for why
 * every non-subscription mode must be recognized, or a token pod boots into `claude /login`). */
function readAgentAuth(): AgentAuth {
  return normalizeAgentAuth(readSpec().agentAuth);
}

function readAgent(): string {
  return readAgents()[0] ?? "claude-code";
}

/** Every agent the spec declares for THIS pod, primary first. The provider keeps
 * spec.agents current when an agent is added, so a recreate can rebuild all of
 * them — the DB and the pod must never disagree about who runs here. */
function readAgents(): string[] {
  try {
    const spec = readSpec();
    return Array.isArray(spec.agents) && spec.agents.length > 0
      ? (spec.agents as string[])
      : ["claude-code"];
  } catch {
    return ["claude-code"];
  }
}

/** Remote-control session title. Prefer the user's display name (podName) so the
 * app's session list matches the dashboard; fall back to "<envName>: <slug>". */
function readSessionName(): string {
  const spec = readSpec();
  const podName = typeof spec.podName === "string" ? spec.podName.trim() : "";
  if (podName) return podName;
  const envName = typeof spec.envName === "string" ? spec.envName : "";
  const slug = typeof spec.slug === "string" ? spec.slug : "";
  if (envName && slug) return `${envName}: ${slug}`;
  return envName || slug || "podway pod";
}

main().catch((e) => {
  log.error("start_failed", { err: e });
  process.exit(1);
});
