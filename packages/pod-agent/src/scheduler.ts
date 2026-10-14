import { execFile } from "node:child_process";
import { appendFileSync, chownSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger, type Logger } from "@podway/shared/log";
import { sessionStateFromDisk, agentWindowTarget } from "./signals.js";

/**
 * In-pod scheduler for the operations-bot playbook (morning-ops-robot).
 *
 * The bot runs multiple named JOBS (a morning brief, a watch, a routine), each on
 * its own schedule — daily times OR a repeating interval. In the 24/7 model a
 * "run" is a turn INJECTED into the live agent session (not a headless `claude -p`
 * — that would spawn competing `--continue` transcripts in ~/work), gated on the
 * agent being idle. Reuses the greeter's type-then-Enter path.
 *
 * Run lifecycle is tracked in an append-only event log (ops-runs.jsonl): the
 * scheduler appends `started`; the agent appends `succeeded`/`failed` (via the
 * dashboard's /api/runs) once the routine finishes. A DEAD-MAN check surfaces a
 * run that started but never reported back — because a job that silently dies is
 * worse than one that fails loudly. (The EXTERNAL dead-man — a whole pod dying —
 * is a platform concern; a pod can't alert about its own death.)
 *
 * All durable state is on the persistent volume (~/.podway, outside the git tree): the user-owned
 * jobs config, our scheduling bookkeeping, and the run log.
 */

const DEFAULT_INTERVAL_MS = 30_000;
/** A run that started but hasn't reported a terminal event in this long is
 * presumed stalled (dead-man). Generous — real routines can be slow. */
const DEFAULT_STALL_GRACE_MS = 30 * 60_000;
/** A due job deferred this long ONLY because the agent is busy is typed in anyway: Claude queues it as
 * the next message. A pod that never goes idle (a turn waiting on background agents) starved every
 * job for 19 h (podway GTM, 2026-10-13). Never applies while the agent waits on the owner. */
const BUSY_FORCE_MS = 30 * 60_000;

export type JobMode = "brief" | "watch" | "routine";
/** What a run IS (schedule-job-kinds): `exec` = a shell command pod-agent runs itself (no AI, no chat);
 * `agent` = a headless agent run with a prompt file (no chat); `chat` = a turn typed into the main
 * session (the original, and the default for jobs without a kind). */
export type JobKind = "exec" | "agent" | "chat";
/** Background runs (exec/agent) never wait for the main session. Defaults: script 10 min, agent 30 min. */
const EXEC_TIMEOUT_MS = 10 * 60_000;
const AGENT_TIMEOUT_MS = 30 * 60_000;
const AGENT_PREAMBLE =
  "You are a scheduled background job on this pod, not the main session. Only read, or write under your " +
  "own ~/ops folder; changes to code or the database belong in a chat job. Do the task below, then end with " +
  "ONE summary line for the owner; write exactly OK as the last line if nothing needs the owner.\n\n";

export interface JobSchedule {
  /** OR one moment (ISO timestamp): the job fires once, then is removed from the jobs file. */
  at?: string;
  /** Daily local times ("HH:MM"). */
  times?: string[];
  /** OR a repeating interval in minutes (watch jobs). */
  everyMinutes?: number;
  /** IANA timezone for `times` (defaults UTC). */
  timezone?: string;
  /** Restrict `times` to these weekdays (0=Sun..6=Sat, in `timezone`). Absent = every
   * day. Lets a daily-time job be weekly (e.g. `[1]` = Mondays only). */
  days?: number[];
}

export interface OpsJob {
  id: string;
  name: string;
  mode: JobMode;
  schedule: JobSchedule;
  enabled: boolean;
  /** Free-text description of what to do when the job runs. Carried verbatim into the
   * injected turn so a generic pod's agent knows the task without a dashboard. Optional
   * for back-compat (the operations-bot playbook keeps its behavior via its rules). */
  instructions?: string;
  kind?: JobKind;
  /** exec jobs: the shell command (run with `bash -lc` as the pod user, cwd ~/work or ~). */
  exec?: string;
  /** agent jobs: the prompt file (absolute or ~-relative). */
  promptFile?: string;
}

interface JobsConfig {
  jobs: OpsJob[];
}

/** Per-job scheduling bookkeeping + which stalls we've already alerted (so a
 * dead-man fires once, not every tick). Separate from the user's jobs config. */
interface SchedulerState {
  jobs: Record<string, { ranDates?: Record<string, string[]>; lastRunAt?: string }>;
  stallAlerted?: string[];
  /** When the current run of busy-only deferrals began (ISO). Cleared when a job fires. */
  busySince?: string;
  /** When a due job was first held back, for ANY reason (busy, a question open). Cleared when a job
   * fires or nothing is due. /healthz reports its age as `jobsOverdueMs` (fleet health alerts). */
  deferredSince?: string;
}

interface RunEvent {
  runId: string;
  jobId: string;
  jobName?: string;
  event: "started" | "succeeded" | "failed";
  at: string;
  summary?: string;
  kind?: JobKind;
  /** started events: minutes after the scheduled slot (the lateness `podway schedule list` shows). */
  lateMin?: number;
  /** terminal events of background runs: the run's log file. */
  log?: string;
}

export interface SchedulerOptions {
  /** tmux session to inject the run turn into (the pod's main session). */
  sessionName: string;
  /** User-authored jobs (JSON: JobsConfig). */
  jobsPath: string;
  /** Our scheduling bookkeeping (JSON: SchedulerState). */
  statePath: string;
  /** Append-only run event log (JSONL: RunEvent). */
  runsLogPath: string;
  uid?: number;
  gid?: number;
  logger?: Logger;
  intervalMs?: number;
  stallGraceMs?: number;
  /** Epoch ms of the current pod boot. A run that started before this was interrupted by
   * a restart, not stalled — so it must not trip the dead-man. Defaults to the real boot
   * time from os.uptime(); injectable for tests. */
  bootTimeMs?: number;
  // --- injection points (tests) ---
  now?: () => Date;
  inject?: (text: string) => Promise<boolean>;
  status?: () => { status?: string; waitingFor?: string };
  /** Build the turn that starts a job run (override in tests). */
  runTrigger?: (job: OpsJob, runId: string) => string;
  /** Build the turn that flags a stalled run. */
  stallTrigger?: (run: { jobId: string; runId: string; startedAt: string }) => string;
  /** Generate a run id (override in tests for determinism). */
  makeRunId?: (jobId: string) => string;
  /** The pod user's home (cwd + log root for background runs). Defaults to the parent of jobsPath's dir. */
  home?: string;
  /** Shell that runs a headless agent reading its prompt from stdin (boot.ts headlessCommandForAgent). */
  agentCommand?: () => string;
  /** Run one exec/agent job to completion (override in tests). */
  runBackground?: (job: OpsJob, runId: string) => Promise<BackgroundResult>;
}

export interface BackgroundResult {
  ok: boolean;
  /** exec: the output tail on failure; agent: the last line of its answer. */
  summary: string;
  log?: string;
}

/** Per-scheduler in-memory state (keyed by statePath): runs in flight + one-line notices for the agent.
 * ponytail: notices are in memory — a pod-agent restart drops an undelivered one (the run log keeps it). */
const live = new Map<string, { inFlight: Set<string>; agentBusy: boolean; notices: string[]; failing: Set<string> }>();
function liveFor(statePath: string) {
  let l = live.get(statePath);
  if (!l) live.set(statePath, (l = { inFlight: new Set(), agentBusy: false, notices: [], failing: new Set() }));
  return l;
}

function kindOf(job: OpsJob): JobKind {
  return job.kind ?? "chat";
}

/** Minutes after the scheduled slot this run starts (same-day slots; interval = since it fell due). */
export function lateMinutes(job: OpsJob, markTime: string | undefined, lastRunAt: string | undefined, now: Date): number {
  let ms = 0;
  if (job.schedule?.at) ms = now.getTime() - Date.parse(job.schedule.at);
  else if (markTime) {
    const [h, m] = localParts(now, job.schedule.timezone).hhmm.split(":").map(Number);
    const [sh, sm] = markTime.split(":").map(Number);
    ms = ((h * 60 + m) - (sh * 60 + sm)) * 60_000;
  } else if (lastRunAt && job.schedule?.everyMinutes) {
    ms = now.getTime() - Date.parse(lastRunAt) - job.schedule.everyMinutes * 60_000;
  }
  return Math.max(0, Math.round(ms / 60_000));
}

/** The one line a finished background run sends the main session, or null when there is nothing to say. */
export function noticeFor(job: OpsJob, r: BackgroundResult): string | null {
  const flat = (t: string, n: number) => t.replace(/\s+/g, " ").trim().slice(0, n);
  const log = r.log ? ` Log: ${r.log}` : "";
  if (kindOf(job) === "exec") return r.ok ? null : `[podway job] Script "${job.name}" failed: ${flat(r.summary, 200)}.${log}`;
  if (r.ok && r.summary.trim() === "OK") return null;
  return `[podway job] "${job.name}"${r.ok ? "" : " failed"}: ${flat(r.summary, 300)}${log}`;
}

// The scheduler injects these as raw text into the agent's prompt (tmux), so they can't get the
// Claude client's own envelope styling — but a clean, tagged block reads far better than the old
// run-on paragraph. Keep the load-bearing tokens (job name, runId, the `podway schedule done`
// commands, "Dead-man") — the dashboard/tests and the agent both key on them.
// ONE line (schedule-job-kinds): the 40-line pasted block filled owners' chats (ogo.co.il, 2026-10-14). The
// instructions are copied to the run's own file when it fires — a one-shot job is gone from the jobs file
// by the time the agent reads them (test:1, 2026-10-14).
function chatRunFile(job: OpsJob, runId: string): string {
  return `.podway/jobs/runs/${job.id}/${runId}.md`;
}
function defaultRunTrigger(job: OpsJob, runId: string): string {
  return (
    `[podway job] Scheduled job "${job.name}" (${runId}) — instructions: cat ~/${chatRunFile(job, runId)} . ` +
    `When done: podway schedule done ${runId} (or: … ${runId} fail).`
  );
}

function defaultStallTrigger(run: { jobId: string; runId: string; startedAt: string }): string {
  return (
    `<podway-scheduled-job-stalled job="${run.jobId}" run="${run.runId}" started="${run.startedAt}">\n` +
    `Dead-man: this run started but never reported back.\n` +
    `If it already finished, just close it:   podway schedule done ${run.runId}\n` +
    `If it's stuck, finish or abandon it, then: podway schedule done ${run.runId} fail\n` +
    `Then report the failure per your environment's scheduled-run rules.\n` +
    `</podway-scheduled-job-stalled>`
  );
}

/** Local "YYYY-MM-DD" and "HH:MM" for a moment in an IANA timezone. Falls back to
 * UTC on an invalid zone (never throw the scheduler down over a typo). */
export function localParts(
  now: Date,
  timezone?: string,
): { date: string; hhmm: string; weekday: number } {
  const tz = timezone || "UTC";
  const fmt = (opts: Intl.DateTimeFormatOptions): string => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: tz, ...opts }).format(now);
    } catch {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", ...opts }).format(now);
    }
  };
  const date = fmt({ year: "numeric", month: "2-digit", day: "2-digit" });
  const hhmm = fmt({ hour: "2-digit", minute: "2-digit", hour12: false }).replace(/^24:/, "00:");
  // Weekday (0=Sun..6=Sat) of the LOCAL calendar date: getUTCDay of that date at UTC
  // midnight is stable regardless of time-of-day, so it needs no locale-name mapping.
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return { date, hhmm, weekday };
}

function isTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown, uid?: number, gid?: number): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2));
  chownBestEffort(file, uid, gid);
}

function chownBestEffort(file: string, uid?: number, gid?: number): void {
  if (uid === undefined) return;
  try {
    chownSync(file, uid, gid ?? uid);
  } catch {
    /* best-effort */
  }
}

function readRunEvents(file: string): RunEvent[] {
  try {
    return readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as RunEvent;
        } catch {
          return null;
        }
      })
      .filter((e): e is RunEvent => e !== null);
  } catch {
    return [];
  }
}

/** Reduce the event log to per-run state (last write wins for the terminal event). */
export function reduceRuns(events: RunEvent[]): Map<string, { jobId: string; startedAt?: string; terminal?: boolean; kind?: JobKind }> {
  const runs = new Map<string, { jobId: string; startedAt?: string; terminal?: boolean; kind?: JobKind }>();
  for (const e of events) {
    const cur = runs.get(e.runId) ?? { jobId: e.jobId };
    if (e.event === "started") {
      cur.startedAt = e.at;
      cur.kind = e.kind;
    }
    else cur.terminal = true;
    runs.set(e.runId, cur);
  }
  return runs;
}

/** Jobs due to run now, given the schedule + what's already run. */
export function dueJobs(
  jobs: OpsJob[],
  state: SchedulerState,
  now: Date,
): Array<{ job: OpsJob; markTime?: string }> {
  const out: Array<{ job: OpsJob; markTime?: string }> = [];
  for (const job of jobs) {
    if (!job.enabled) continue;
    const js = state.jobs[job.id] ?? {};
    const { at, times, everyMinutes, timezone, days } = job.schedule ?? {};
    if (typeof at === "string") {
      if (!js.lastRunAt && now.getTime() >= Date.parse(at)) out.push({ job });
    } else if (Array.isArray(times) && times.length > 0) {
      const { date, hhmm, weekday } = localParts(now, timezone);
      // Weekday restriction (absent = every day): skip on days not listed.
      if (Array.isArray(days) && days.length > 0 && !days.includes(weekday)) continue;
      const ranToday = new Set(js.ranDates?.[date] ?? []);
      const due = times.filter(isTime).filter((t) => t <= hhmm && !ranToday.has(t)).sort();
      if (due.length > 0) out.push({ job, markTime: due[0] });
    } else if (typeof everyMinutes === "number" && everyMinutes > 0) {
      const last = js.lastRunAt ? Date.parse(js.lastRunAt) : NaN;
      if (Number.isNaN(last) || now.getTime() - last >= everyMinutes * 60_000) out.push({ job });
    }
  }
  return out;
}

/** Record that a job just ran (per-day time, or interval timestamp). */
function markRan(state: SchedulerState, job: OpsJob, markTime: string | undefined, now: Date): void {
  const js = state.jobs[job.id] ?? {};
  if (markTime) {
    const { date } = localParts(now, job.schedule.timezone);
    const ranDates = js.ranDates ?? {};
    ranDates[date] = [...new Set([...(ranDates[date] ?? []), markTime])];
    js.ranDates = ranDates;
  } else {
    js.lastRunAt = now.toISOString();
  }
  state.jobs[job.id] = js;
}

export type TickResult =
  | { fired: false; reason: "no-config" | "no-jobs" | "none-due" | "deferred" }
  | { fired: true; kind: "run"; jobId: string; runId: string }
  | { fired: true; kind: "stall"; runId: string }
  | { fired: true; kind: "notice" };

/**
 * One scheduler check. Fires at most one turn per tick (a job run, or — if none is
 * due — a dead-man stall alert), keeping the transcript clean. Pure w.r.t. its
 * injected now/inject/status; all durable state is on disk.
 */
export async function runSchedulerTick(opts: SchedulerOptions): Promise<TickResult> {
  const log = opts.logger ?? createLogger("pod-agent");
  const now = opts.now ?? (() => new Date());
  const inject = opts.inject ?? defaultInject(opts.sessionName, opts.uid, opts.gid);
  const status = opts.status ?? (() => sessionStateFromDisk());
  const runTrigger = opts.runTrigger ?? defaultRunTrigger;
  const stallTrigger = opts.stallTrigger ?? defaultStallTrigger;
  const graceMs = opts.stallGraceMs ?? DEFAULT_STALL_GRACE_MS;
  const makeRunId = opts.makeRunId ?? ((jobId: string) => `${jobId}-${now().getTime()}`);

  if (!existsSync(opts.jobsPath)) return { fired: false, reason: "no-config" };
  const cfg = readJson<JobsConfig>(opts.jobsPath, { jobs: [] });
  const jobs = Array.isArray(cfg.jobs) ? cfg.jobs : [];
  if (jobs.length === 0) return { fired: false, reason: "no-jobs" };

  const state = readJson<SchedulerState>(opts.statePath, { jobs: {} });
  // A daily slot that passed BEFORE the job existed is not "missed": without this, a job added at
  // 19:41 with --at 00:50 fired at once (2026-09-27). Seed a never-seen job's already-passed slots
  // for today as ran. Catch-up after a restart is unaffected — that job already has state.
  let seeded = false;
  for (const job of jobs) {
    const times = job.schedule?.times;
    if (state.jobs[job.id] || !Array.isArray(times) || times.length === 0) continue;
    const { date, hhmm } = localParts(now(), job.schedule.timezone);
    state.jobs[job.id] = { ranDates: { [date]: times.filter(isTime).filter((t) => t < hhmm) } };
    seeded = true;
  }
  if (seeded) writeJson(opts.statePath, state, opts.uid, opts.gid);
  const due = dueJobs(jobs, state, now());
  const l = liveFor(opts.statePath);
  const runBg = opts.runBackground ?? defaultRunBackground(opts);
  const dropOneShot = (job: OpsJob) => {
    if (typeof job.schedule?.at !== "string") return;
    // One-shot: done after firing. Re-read so a job the CLI added this tick is not lost.
    const latest = readJson<JobsConfig>(opts.jobsPath, { jobs: [] });
    writeJson(opts.jobsPath, { ...latest, jobs: (latest.jobs ?? []).filter((j) => j.id !== job.id) }, opts.uid, opts.gid);
  };

  // 0) Background jobs (exec/agent) start ON TIME — they never wait for the main session and never use
  //    the busy fallback below. One run per job at a time; one agent run at a time per pod.
  for (const { job, markTime } of due.filter((d) => kindOf(d.job) !== "chat")) {
    const kind = kindOf(job);
    if (l.inFlight.has(job.id) || (kind === "agent" && l.agentBusy)) continue;
    const runId = makeRunId(job.id);
    const lateMin = lateMinutes(job, markTime, state.jobs[job.id]?.lastRunAt, now());
    markRan(state, job, markTime, now());
    writeJson(opts.statePath, state, opts.uid, opts.gid);
    dropOneShot(job);
    appendEvent(opts, { runId, jobId: job.id, jobName: job.name, event: "started", at: now().toISOString(), kind, lateMin });
    l.inFlight.add(job.id);
    if (kind === "agent") l.agentBusy = true;
    log.info("ops_run_background", { jobId: job.id, runId, kind, lateMin });
    void runBg(job, runId)
      .catch((e): BackgroundResult => ({ ok: false, summary: String(e) }))
      .then((r) => {
        l.inFlight.delete(job.id);
        if (kind === "agent") l.agentBusy = false;
        appendEvent(opts, {
          runId, jobId: job.id, jobName: job.name, event: r.ok ? "succeeded" : "failed", at: now().toISOString(),
          summary: r.summary.slice(0, 500), log: r.log, kind,
        });
        // A script that keeps failing says so ONCE, then once when it works again — not every run (a
        // failing every-minute check queued a notice per run on test:1, 2026-10-14).
        let n = noticeFor(job, r);
        if (kind === "exec") {
          const was = l.failing.has(job.id);
          if (r.ok) l.failing.delete(job.id);
          else l.failing.add(job.id);
          if (!r.ok && was) n = null;
          if (r.ok && was) n = `[podway job] Script "${job.name}" works again.`;
        }
        if (n) l.notices.push(n);
        log.info("ops_run_background_done", { jobId: job.id, runId, ok: r.ok, notice: Boolean(n) });
      });
  }
  const chatDue = due.filter((d) => kindOf(d.job) === "chat");

  // Only inject when the agent can take a turn. busy/shell = working. ANY waitingFor (or status
  // "waiting") means the CLI is waiting on the OWNER — a question box ("input needed"), a sandbox
  // request, a dialog — and typed keys go to that UI. Matching only /dialog/ let a run be typed into
  // an open AskUserQuestion: the run was lost and its newlines picked the "(Recommended)" options,
  // answering the owner's questions (merges, live-data writes) for them (afisha crawler, 2026-10-06).
  const s = status();
  const canInject =
    !(s.status === "busy" || s.status === "shell" || s.status === "waiting") &&
    !(typeof s.waitingFor === "string" && s.waitingFor.length > 0);

  // A finished background run's one-line notice, when the agent can take it (never the busy fallback).
  if (l.notices.length > 0 && canInject) {
    await inject(l.notices.shift()!);
    log.info("ops_notice_sent", {});
    return { fired: true, kind: "notice" };
  }

  // 1) Fire the earliest-due chat job (one per tick).
  if (chatDue.length > 0) {
    // Busy (working), not waiting on the owner: after BUSY_FORCE_MS, type it in as a queued message.
    const busyOnly = (s.status === "busy" || s.status === "shell") && !s.waitingFor;
    if (!canInject && busyOnly) {
      state.busySince ??= now().toISOString();
      writeJson(opts.statePath, state, opts.uid, opts.gid);
    }
    const forced = !canInject && busyOnly && now().getTime() - Date.parse(state.busySince!) >= BUSY_FORCE_MS;
    if (!canInject && !forced) {
      if (!state.deferredSince) {
        state.deferredSince = now().toISOString();
        writeJson(opts.statePath, state, opts.uid, opts.gid);
      }
      log.info("ops_run_deferred", { due: chatDue.map((d) => d.job.id), status: s.status });
      return { fired: false, reason: "deferred" };
    }
    delete state.busySince;
    delete state.deferredSince;
    if (forced) log.info("ops_run_forced_busy", { jobId: chatDue[0].job.id });
    const { job, markTime } = chatDue[0];
    const runId = makeRunId(job.id);
    const lateMin = lateMinutes(job, markTime, state.jobs[job.id]?.lastRunAt, now());
    try {
      const f = path.join(opts.home ?? path.dirname(path.dirname(opts.jobsPath)), chatRunFile(job, runId));
      mkdirSync(path.dirname(f), { recursive: true });
      writeFileSync(f, job.instructions?.trim() || "Run it per its definition in ~/.podway/ops-jobs.json.");
      chownBestEffort(f, opts.uid, opts.gid);
    } catch {
      /* the trigger still names the job */
    }
    await inject(runTrigger(job, runId));
    markRan(state, job, markTime, now());
    writeJson(opts.statePath, state, opts.uid, opts.gid);
    dropOneShot(job);
    appendEvent(opts, { runId, jobId: job.id, jobName: job.name, event: "started", at: now().toISOString(), kind: "chat", lateMin });
    log.info("ops_run_injected", { jobId: job.id, runId, mode: job.mode });
    return { fired: true, kind: "run", jobId: job.id, runId };
  }

  if (state.busySince || state.deferredSince) {
    delete state.busySince; // nothing due: a later job starts a fresh 30-min clock
    delete state.deferredSince;
    writeJson(opts.statePath, state, opts.uid, opts.gid);
  }

  // 2) No job due → dead-man: a run that started but never reported back.
  const runs = reduceRuns(readRunEvents(opts.runsLogPath));
  const alerted = new Set(state.stallAlerted ?? []);
  // A run that started BEFORE the current boot was interrupted by a pod restart, not
  // silently hung — the agent was killed mid-run and never got to append its terminal
  // event. That is an expected lifecycle event (and an idempotent job's next scheduled
  // run catches up), so it must NOT trip the dead-man. Close it out silently — mark it
  // handled so we stop re-checking it, but inject nothing. Without this, EVERY in-flight
  // run trips a false "never reported back" alarm 30 min after any restart.
  const bootTimeMs = opts.bootTimeMs ?? Date.now() - Math.floor(os.uptime() * 1000);
  for (const [runId, r] of runs) {
    // Background runs close themselves (their runner always writes the terminal event, timeout included).
    if (r.terminal || alerted.has(runId) || !r.startedAt || r.kind === "exec" || r.kind === "agent") continue;
    if (Date.parse(r.startedAt) < bootTimeMs) {
      alerted.add(runId);
      state.stallAlerted = [...alerted];
      writeJson(opts.statePath, state, opts.uid, opts.gid);
      log.info("ops_run_interrupted", { jobId: r.jobId, runId, startedAt: r.startedAt });
      continue;
    }
    if (now().getTime() - Date.parse(r.startedAt) < graceMs) continue;
    if (!canInject) return { fired: false, reason: "deferred" };
    await inject(stallTrigger({ jobId: r.jobId, runId, startedAt: r.startedAt }));
    state.stallAlerted = [...alerted, runId];
    writeJson(opts.statePath, state, opts.uid, opts.gid);
    log.info("ops_run_stalled", { jobId: r.jobId, runId });
    return { fired: true, kind: "stall", runId };
  }

  return { fired: false, reason: "none-due" };
}

function appendEvent(opts: SchedulerOptions, event: RunEvent): void {
  try {
    mkdirSync(path.dirname(opts.runsLogPath), { recursive: true });
    appendFileSync(opts.runsLogPath, JSON.stringify(event) + "\n");
    chownBestEffort(opts.runsLogPath, opts.uid, opts.gid);
  } catch {
    /* observability only */
  }
}

/** Runs an exec/agent job with `bash -lc` as the pod user, logs to ~/.podway/jobs/runs/<job>/<run>.log. */
function defaultRunBackground(opts: SchedulerOptions) {
  const home = opts.home ?? path.dirname(path.dirname(opts.jobsPath));
  return (job: OpsJob, runId: string): Promise<BackgroundResult> =>
    new Promise((resolve) => {
      const dir = path.join(home, ".podway", "jobs", "runs", job.id);
      const logFile = path.join(dir, `${runId}.log`);
      const agent = kindOf(job) === "agent";
      let input = "";
      if (agent) {
        const file = (job.promptFile ?? "").replace(/^~(?=\/|$)/, home);
        try {
          input = AGENT_PREAMBLE + readFileSync(file, "utf8");
        } catch {
          resolve({ ok: false, summary: `prompt file not readable: ${job.promptFile}` });
          return;
        }
      }
      const cmd = agent ? (opts.agentCommand?.() ?? "env -u ANTHROPIC_API_KEY claude -p --no-session-persistence") : job.exec ?? "false";
      const child = execFile(
        "bash",
        ["-lc", `cd ~/work 2>/dev/null || cd ~; ${cmd}`],
        {
          uid: opts.uid, gid: opts.gid, cwd: home, maxBuffer: 8 * 1024 * 1024, killSignal: "SIGKILL",
          timeout: agent ? AGENT_TIMEOUT_MS : EXEC_TIMEOUT_MS,
          env: { ...process.env, HOME: home, USER: "dev", LOGNAME: "dev" },
        },
        (err, stdout, stderr) => {
          const out = `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`;
          try {
            mkdirSync(dir, { recursive: true });
            writeFileSync(logFile, out);
            chownBestEffort(logFile, opts.uid, opts.gid);
          } catch {
            /* the run event still records the result */
          }
          const lines = (agent ? stdout : out).split("\n").map((x) => x.trim()).filter(Boolean);
          const e = err as (NodeJS.ErrnoException & { killed?: boolean; code?: number | string }) | null;
          const why = e?.killed ? "timed out" : e ? `exit ${e.code}` : "";
          const summary = agent ? (lines.at(-1) ?? why) : [why, lines.slice(-2).join(" | ")].filter(Boolean).join(": ");
          resolve({ ok: !e, summary: e && agent ? `${why}: ${summary}` : summary, log: logFile });
        },
      );
      if (agent) child.stdin?.end(input);
      else child.stdin?.end();
    });
}

function defaultInject(sessionName: string, uid?: number, gid?: number) {
  const tmux = (args: string[]): Promise<string> =>
    new Promise((resolve) => {
      execFile("tmux", args, { maxBuffer: 1024 * 1024, uid, gid }, (err, stdout) =>
        resolve(err ? "" : stdout),
      );
    });
  return async (text: string): Promise<boolean> => {
    // Inject into the AGENT's window, not the active one — a scheduled job must
    // reach the agent even if the user has switched to a shell tab (cheap-tabs).
    const target = await agentWindowTarget(sessionName, { uid, gid });
    await tmux(["send-keys", "-t", target, "-l", text]);
    await new Promise((r) => setTimeout(r, 400));
    await tmux(["send-keys", "-t", target, "Enter"]);
    return true;
  };
}

/**
 * Start the scheduler loop. Returns a stop function. Safe to start unconditionally:
 * with no jobs config each tick no-ops, so only the ops-bot playbook — which writes
 * one — actually schedules runs.
 */
export function startScheduler(opts: SchedulerOptions): () => void {
  const log = opts.logger ?? createLogger("pod-agent");
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await runSchedulerTick(opts);
    } catch (e) {
      log.warn("ops_scheduler_tick_failed", { err: e });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  void tick();
  return () => clearInterval(timer);
}

/** How long a due job has been held back (ms), or null (nothing overdue / no scheduler state). */
export function jobsOverdueMs(statePath: string, nowMs = Date.now()): number | null {
  const since = readJson<SchedulerState>(statePath, { jobs: {} }).deferredSince;
  const t = since ? Date.parse(since) : NaN;
  return Number.isNaN(t) ? null : Math.max(0, nowMs - t);
}
