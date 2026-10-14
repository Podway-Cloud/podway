import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  runSchedulerTick,
  localParts,
  dueJobs,
  reduceRuns,
  jobsOverdueMs,
  type SchedulerOptions,
  type OpsJob,
} from "../src/scheduler.js";

function tmp() {
  const dir = mkdtempSync(path.join(tmpdir(), "sched-"));
  return {
    dir,
    jobsPath: path.join(dir, "ops-jobs.json"),
    statePath: path.join(dir, "ops-state.json"),
    runsLogPath: path.join(dir, "ops-runs.jsonl"),
  };
}

function opts(
  p: ReturnType<typeof tmp>,
  now: Date,
  extra: Partial<SchedulerOptions> = {},
): { o: SchedulerOptions; injected: string[] } {
  const injected: string[] = [];
  const o: SchedulerOptions = {
    sessionName: "main",
    jobsPath: p.jobsPath,
    statePath: p.statePath,
    runsLogPath: p.runsLogPath,
    now: () => now,
    inject: async (text) => {
      injected.push(text);
      return true;
    },
    status: () => ({ status: "idle" }),
    makeRunId: (jobId) => `${jobId}-run`,
    // Default: boot at epoch 0, so every run counts as "this boot" (i.e. restart-awareness
    // is off unless a test opts in). Restart tests override this.
    bootTimeMs: 0,
    ...extra,
  };
  return { o, injected };
}

function writeJobs(p: ReturnType<typeof tmp>, jobs: OpsJob[]) {
  writeFileSync(p.jobsPath, JSON.stringify({ jobs }));
}

const brief: OpsJob = {
  id: "brief",
  name: "Morning brief",
  mode: "brief",
  schedule: { times: ["08:00"], timezone: "UTC" },
  enabled: true,
};
const watch: OpsJob = {
  id: "uptime",
  name: "Uptime",
  mode: "watch",
  schedule: { everyMinutes: 30, timezone: "UTC" },
  enabled: true,
};

describe("localParts", () => {
  it("formats date + HH:MM in the given timezone; falls back to UTC on a bad zone", () => {
    const inst = new Date("2026-07-22T06:30:00Z");
    expect(localParts(inst, "Europe/Berlin")).toEqual({ date: "2026-07-22", hhmm: "08:30", weekday: 3 });
    expect(localParts(inst, "Not/AZone")).toEqual({ date: "2026-07-22", hhmm: "06:30", weekday: 3 });
  });
  it("computes the weekday in the given timezone (0=Sun..6=Sat)", () => {
    expect(localParts(new Date("2026-08-03T12:00:00Z"), "UTC").weekday).toBe(1); // Monday
    // Sunday in UTC, but Monday in Asia/Jerusalem (UTC+3) — the LOCAL weekday wins.
    expect(localParts(new Date("2026-08-02T22:00:00Z"), "Asia/Jerusalem").weekday).toBe(1);
  });
});

describe("dueJobs", () => {
  it("daily-time job is due once the time passes, not before", () => {
    expect(dueJobs([brief], { jobs: {} }, new Date("2026-07-22T07:59:00Z"))).toHaveLength(0);
    expect(dueJobs([brief], { jobs: {} }, new Date("2026-07-22T08:01:00Z"))).toHaveLength(1);
  });
  it("interval job is due when everyMinutes elapsed since lastRunAt", () => {
    const state = { jobs: { uptime: { lastRunAt: "2026-07-22T08:00:00Z" } } };
    expect(dueJobs([watch], state, new Date("2026-07-22T08:20:00Z"))).toHaveLength(0);
    expect(dueJobs([watch], state, new Date("2026-07-22T08:31:00Z"))).toHaveLength(1);
  });
  it("disabled jobs never fire", () => {
    expect(dueJobs([{ ...brief, enabled: false }], { jobs: {} }, new Date("2026-07-22T09:00:00Z"))).toHaveLength(0);
  });
  it("a times job restricted to weekdays fires only on those days", () => {
    const mon = { ...brief, schedule: { times: ["08:00"], timezone: "UTC", days: [1] } };
    expect(dueJobs([mon], { jobs: {} }, new Date("2026-08-03T08:01:00Z"))).toHaveLength(1); // Monday
    expect(dueJobs([mon], { jobs: {} }, new Date("2026-08-04T08:01:00Z"))).toHaveLength(0); // Tuesday
    const wd = { ...brief, schedule: { times: ["08:00"], timezone: "UTC", days: [1, 2, 3, 4, 5] } };
    expect(dueJobs([wd], { jobs: {} }, new Date("2026-08-04T08:01:00Z"))).toHaveLength(1); // Tue (weekday)
    expect(dueJobs([wd], { jobs: {} }, new Date("2026-08-08T08:01:00Z"))).toHaveLength(0); // Sat (weekend)
  });
  it("no days restriction = every day (back-compat)", () => {
    expect(dueJobs([brief], { jobs: {} }, new Date("2026-08-08T08:01:00Z"))).toHaveLength(1); // Sat, still fires
  });
});

describe("reduceRuns", () => {
  it("marks a run terminal once a succeeded/failed event arrives", () => {
    const runs = reduceRuns([
      { runId: "r1", jobId: "brief", event: "started", at: "2026-07-22T08:00:00Z" },
      { runId: "r2", jobId: "uptime", event: "started", at: "2026-07-22T08:00:00Z" },
      { runId: "r1", jobId: "brief", event: "succeeded", at: "2026-07-22T08:05:00Z" },
    ]);
    expect(runs.get("r1")?.terminal).toBe(true);
    expect(runs.get("r2")?.terminal).toBeUndefined();
  });
});

describe("runSchedulerTick", () => {
  it("no-ops with no config / no jobs", async () => {
    const p = tmp();
    const { o } = opts(p, new Date("2026-07-22T08:00:00Z"));
    expect(await runSchedulerTick(o)).toEqual({ fired: false, reason: "no-config" });
    writeJobs(p, []);
    expect(await runSchedulerTick(o)).toEqual({ fired: false, reason: "no-jobs" });
  });

  it("fires a due job once, logs a started event, and doesn't re-fire it", async () => {
    const p = tmp();
    writeJobs(p, [brief]);
    const { o, injected } = opts(p, new Date("2026-07-22T08:00:30Z"));

    const r1 = await runSchedulerTick(o);
    expect(r1).toEqual({ fired: true, kind: "run", jobId: "brief", runId: "brief-run" });
    expect(injected).toHaveLength(1);
    expect(injected[0]).toContain("brief-run");
    expect(injected[0]).toContain("Morning brief");
    expect(injected[0]).not.toContain("/api/runs"); // env-neutral: no hardcoded dashboard path
    // The turn MUST tell the agent to close the run — else a cleanly-finished generic job
    // (no playbook report rules) never gets a terminal event and the dead-man false-fires.
    expect(injected[0]).toContain("podway schedule done brief-run");

    const r2 = await runSchedulerTick(o);
    expect(r2).toEqual({ fired: false, reason: "none-due" });
    expect(injected).toHaveLength(1);

    const events = readFileSync(p.runsLogPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(events).toEqual([
      expect.objectContaining({ runId: "brief-run", jobId: "brief", event: "started" }),
    ]);
  });

  it("a one-shot job fires once at its time, then removes itself from the jobs file", async () => {
    // makore.app prod (2026-09-03): every one-off wake became a DAILY job that re-fired until an agent
    // deleted it by hand.
    const p = tmp();
    const once: OpsJob = { id: "once", name: "Wake once", mode: "routine", enabled: true, schedule: { at: "2026-07-22T08:02:00Z" } };
    writeJobs(p, [once, brief]);
    const before = opts(p, new Date("2026-07-22T08:01:00Z"));
    expect((await runSchedulerTick(before.o)).fired && before.injected.some((t) => t.includes("Wake once"))).toBe(false);

    const { o, injected } = opts(p, new Date("2026-07-22T08:02:30Z"), { makeRunId: (id) => `${id}-run` });
    // brief (08:00) is due too; one per tick, earliest-due first — fire until neither is due.
    await runSchedulerTick(o);
    await runSchedulerTick(o);
    expect(injected.filter((t) => t.includes("Wake once"))).toHaveLength(1);
    const left = JSON.parse(readFileSync(p.jobsPath, "utf8")).jobs.map((j: OpsJob) => j.id);
    expect(left).toEqual(["brief"]);
    expect(await runSchedulerTick(o)).toEqual({ fired: false, reason: "none-due" });
  });

  it("a new daily job does NOT fire a slot that passed before it existed (2026-09-27)", async () => {
    const p = tmp();
    writeJobs(p, [{ ...brief, schedule: { times: ["00:50"], timezone: "UTC" } }]);
    const { o, injected } = opts(p, new Date("2026-09-27T19:41:30Z")); // added at 19:41, slot 00:50
    expect(await runSchedulerTick(o)).toEqual({ fired: false, reason: "none-due" });
    expect(injected).toHaveLength(0);
    // …but it fires at the slot the next day.
    const next = opts(p, new Date("2026-09-28T00:50:10Z"));
    expect((await runSchedulerTick(next.o)).fired).toBe(true);
  });

  // schedule-job-kinds: the pasted ~40-line block filled owners' chats (ogo.co.il, 2026-10-14). A chat job's
  // turn is ONE line pointing at `podway schedule show`, plus how to close the run.
  it("types a ONE-line chat trigger that points at the instructions, not the instructions themselves", async () => {
    const p = tmp();
    writeJobs(p, [{ ...brief, instructions: "pull GSC week-over-week and message me" }]);
    const { o, injected } = opts(p, new Date("2026-07-22T08:00:30Z"), { home: p.dir });
    expect((await runSchedulerTick(o)).fired).toBe(true);
    expect(injected[0]).not.toContain("pull GSC week-over-week");
    expect(injected[0]).not.toContain("\n");
    expect(injected[0]).toContain("podway schedule done brief-run");
    // The instructions live in the run's own file (a one-shot job is already gone from the jobs file).
    const file = injected[0].match(/cat ~\/(\S+)/)![1];
    expect(readFileSync(path.join(p.dir, file), "utf8")).toBe("pull GSC week-over-week and message me");
  });

  it("runs an exec job ON TIME while the agent is busy, silently on success, one line on failure", async () => {
    const p = tmp();
    writeJobs(p, [{ ...watch, id: "ping", name: "ping", kind: "exec", exec: "curl -fsS x" }]);
    let now = new Date("2026-07-22T08:00:00Z");
    let busy = true;
    const results = [{ ok: true, summary: "" }, { ok: false, summary: "exit 22: 404" }];
    const ran: string[] = [];
    const { o, injected } = opts(p, now, {
      now: () => now,
      status: () => ({ status: busy ? "busy" : "idle" }),
      runBackground: async (job) => (ran.push(job.id), results.shift()!),
    });
    await runSchedulerTick(o); // busy, but the script still runs
    await new Promise((r) => setImmediate(r));
    expect(ran).toEqual(["ping"]);
    busy = false;
    expect(await runSchedulerTick(o)).toEqual({ fired: false, reason: "none-due" }); // success → nothing typed
    now = new Date("2026-07-22T08:31:00Z");
    busy = true;
    await runSchedulerTick(o); // second run fails while busy: the notice WAITS (no busy fallback)
    await new Promise((r) => setImmediate(r));
    expect(injected).toHaveLength(0);
    busy = false;
    expect(await runSchedulerTick(o)).toEqual({ fired: true, kind: "notice" });
    expect(injected).toHaveLength(1);
    expect(injected[0]).toBe('[podway job] Script "ping" failed: exit 22: 404.');
    const events = readFileSync(p.runsLogPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(events.filter((e) => e.event === "failed")).toHaveLength(1);
    expect(events.find((e) => e.event === "started").kind).toBe("exec");
  });

  it("a script that keeps failing says so once, then once when it works again", async () => {
    const p = tmp();
    writeJobs(p, [{ ...watch, id: "chk", name: "chk", kind: "exec", exec: "x" }]);
    let now = new Date("2026-07-22T08:00:00Z");
    const results = [false, false, false, true].map((ok) => ({ ok, summary: ok ? "" : "exit 1: down" }));
    const { o, injected } = opts(p, now, { now: () => now, runBackground: async () => results.shift() ?? { ok: true, summary: "" } });
    for (let i = 0; i < 4; i++) {
      await runSchedulerTick(o);
      await new Promise((r) => setImmediate(r));
      now = new Date(now.getTime() + 31 * 60_000);
    }
    for (let i = 0; i < 4; i++) await runSchedulerTick(o);
    expect(injected).toEqual(['[podway job] Script "chk" failed: exit 1: down.', '[podway job] Script "chk" works again.']);
  });

  it("agent job: quiet on OK, one summary line otherwise; one agent run at a time", async () => {
    const p = tmp();
    const a = { ...brief, id: "a1", name: "routine", kind: "agent" as const, promptFile: "~/ops/r.md" };
    const b = { ...brief, id: "a2", name: "second", kind: "agent" as const, promptFile: "~/ops/s.md" };
    writeJobs(p, [a, b]);
    const pending: Array<(r: { ok: boolean; summary: string }) => void> = [];
    const ran: string[] = [];
    const { o, injected } = opts(p, new Date("2026-07-22T08:00:30Z"), {
      runBackground: (job) => new Promise((res) => (ran.push(job.id), pending.push(res))),
    });
    await runSchedulerTick(o);
    expect(ran).toEqual(["a1"]); // a2 waits for the agent slot
    pending.shift()!({ ok: true, summary: "OK" });
    await new Promise((r) => setImmediate(r));
    await runSchedulerTick(o);
    expect(ran).toEqual(["a1", "a2"]);
    expect(injected).toHaveLength(0); // OK → silent
    pending.shift()!({ ok: true, summary: "2 pages need a new description" });
    await new Promise((r) => setImmediate(r));
    expect(await runSchedulerTick(o)).toEqual({ fired: true, kind: "notice" });
    expect(injected[0]).toBe('[podway job] "second": 2 pages need a new description');
  });

  it("the real runner: bash script fails with its exit code + log; agent run reads its prompt file on stdin", async () => {
    const p = tmp();
    const home = p.dir;
    writeFileSync(path.join(home, "prompt.md"), "say hi");
    writeJobs(p, [
      { ...brief, id: "s1", name: "script", kind: "exec", exec: "echo partial; exit 3" },
      { ...brief, id: "g1", name: "agent", kind: "agent", promptFile: "~/prompt.md" },
    ]);
    const { o, injected } = opts(p, new Date("2026-07-22T08:00:30Z"), {
      home,
      runBackground: undefined,
      // stands in for `claude -p`: proves the preamble + file arrive on stdin, answers with its last line
      agentCommand: () => "grep -q 'scheduled background job' && grep -c . >/dev/null; echo; echo 'agent saw the prompt'",
    });
    await runSchedulerTick(o);
    for (let i = 0; i < 50 && injected.length < 2; i++) {
      await new Promise((r) => setTimeout(r, 50));
      await runSchedulerTick(o);
    }
    expect(injected.some((t) => t.startsWith('[podway job] Script "script" failed: exit 3: partial.'))).toBe(true);
    expect(injected.some((t) => t.startsWith('[podway job] "agent": agent saw the prompt'))).toBe(true);
    const log = injected.find((t) => t.includes("script"))!.match(/Log: (\S+)/)![1];
    expect(readFileSync(log, "utf8")).toContain("partial");
  });

  it("records how late a run started", async () => {
    const p = tmp();
    writeJobs(p, [{ ...brief, kind: "exec", exec: "true" }]);
    const { o } = opts(p, new Date("2026-07-22T08:47:30Z"), { runBackground: async () => ({ ok: true, summary: "" }) });
    // seed: the 08:00 slot passed before the job existed → mark state as seen yesterday so it is due
    writeFileSync(p.statePath, JSON.stringify({ jobs: { brief: { ranDates: {} } } }));
    await runSchedulerTick(o);
    const started = JSON.parse(readFileSync(p.runsLogPath, "utf8").split("\n")[0]);
    expect(started.lateMin).toBe(47);
  });

  it("re-fires an interval job after the interval elapses", async () => {
    const p = tmp();
    writeJobs(p, [watch]);
    let now = new Date("2026-07-22T08:00:00Z");
    const { o, injected } = opts(p, now, { now: () => now });
    expect((await runSchedulerTick(o)).fired).toBe(true); // first run
    now = new Date("2026-07-22T08:20:00Z");
    expect(await runSchedulerTick(o)).toEqual({ fired: false, reason: "none-due" }); // too soon
    now = new Date("2026-07-22T08:31:00Z");
    expect((await runSchedulerTick(o)).fired).toBe(true); // interval elapsed
    expect(injected).toHaveLength(2);
  });

  it("defers when the agent is busy or a dialog is open", async () => {
    const p = tmp();
    writeJobs(p, [brief]);
    const { o } = opts(p, new Date("2026-07-22T08:00:30Z"), { status: () => ({ status: "busy" }) });
    expect(await runSchedulerTick(o)).toEqual({ fired: false, reason: "deferred" });
  });

  // podway GTM, 2026-10-13: a turn that waits on background agents stays "busy" all day, and every job
  // starved for 19 h. After 30 min busy-only, the job is typed in (Claude queues it); one per 30 min.
  it("types a job in after 30 min of busy-only deferral, then waits again for the next one", async () => {
    const p = tmp();
    writeJobs(p, [brief, { ...brief, id: "b2" }]);
    let now = new Date("2026-07-22T08:00:30Z");
    const { o, injected } = opts(p, now, { now: () => now, status: () => ({ status: "busy" }) });
    expect(await runSchedulerTick(o)).toEqual({ fired: false, reason: "deferred" });
    now = new Date("2026-07-22T08:29:00Z");
    expect(await runSchedulerTick(o)).toEqual({ fired: false, reason: "deferred" });
    now = new Date("2026-07-22T08:31:00Z");
    expect((await runSchedulerTick(o)).fired).toBe(true);
    expect(injected).toHaveLength(1);
    now = new Date("2026-07-22T08:32:00Z");
    expect(await runSchedulerTick(o)).toEqual({ fired: false, reason: "deferred" }); // clock restarts
    // A question box is never typed into, however long it has waited.
    const q = tmp();
    writeJobs(q, [brief]);
    let t = new Date("2026-07-22T08:00:30Z");
    const w = opts(q, t, { now: () => t, status: () => ({ status: "waiting", waitingFor: "input needed" }) });
    await runSchedulerTick(w.o);
    t = new Date("2026-07-22T10:00:00Z");
    expect(await runSchedulerTick(w.o)).toEqual({ fired: false, reason: "deferred" });
    expect(w.injected).toHaveLength(0);
  });

  // afisha crawler, 2026-10-06: an open AskUserQuestion reports status "waiting" / waitingFor "input
  // needed". Typing a run into it was lost AND its newlines picked the "(Recommended)" options — the
  // scheduler answered the owner's questions (merges, live-data writes) on their behalf.
  it("defers while the agent waits on the owner (question box, any waitingFor) — never types into it", async () => {
    for (const st of [
      { status: "waiting", waitingFor: "input needed" },
      { status: "idle", waitingFor: "sandbox request" },
      { status: "waiting" },
    ]) {
      const p = tmp();
      writeJobs(p, [brief]);
      const { o, injected } = opts(p, new Date("2026-07-22T08:00:30Z"), { status: () => st });
      expect(await runSchedulerTick(o)).toEqual({ fired: false, reason: "deferred" });
      expect(injected).toHaveLength(0);
    }
  });

  // Fleet health alerts read this on /healthz: a job held back (here: a question box open) has an age.
  it("jobsOverdueMs: the age of a held-back job; cleared once a job fires", async () => {
    const p = tmp();
    writeJobs(p, [brief]);
    let now = new Date("2026-07-22T08:00:30Z");
    let st: { status: string; waitingFor?: string } = { status: "waiting", waitingFor: "input needed" };
    const { o } = opts(p, now, { now: () => now, status: () => st });
    expect(jobsOverdueMs(p.statePath, now.getTime())).toBeNull();
    await runSchedulerTick(o);
    now = new Date("2026-07-22T10:30:30Z");
    await runSchedulerTick(o);
    expect(jobsOverdueMs(p.statePath, now.getTime())).toBe(150 * 60_000);
    st = { status: "idle" };
    expect((await runSchedulerTick(o)).fired).toBe(true);
    expect(jobsOverdueMs(p.statePath, now.getTime())).toBeNull();
  });

  it("dead-man: alerts once for a run that started but never reported back", async () => {
    const p = tmp();
    writeJobs(p, [{ ...brief, enabled: false }]); // no job due
    // A run started 40 min ago, no terminal event.
    appendFileSync(
      p.runsLogPath,
      JSON.stringify({ runId: "stuck", jobId: "brief", event: "started", at: "2026-07-22T08:00:00Z" }) + "\n",
    );
    const { o, injected } = opts(p, new Date("2026-07-22T08:40:00Z"));
    const r = await runSchedulerTick(o);
    expect(r).toEqual({ fired: true, kind: "stall", runId: "stuck" });
    expect(injected[0]).toContain("Dead-man");
    // Fires once — a second tick doesn't re-alert.
    expect(await runSchedulerTick(o)).toEqual({ fired: false, reason: "none-due" });
    expect(injected).toHaveLength(1);
  });

  it("dead-man does NOT fire while within the grace window or after a terminal event", async () => {
    const p = tmp();
    writeJobs(p, [{ ...brief, enabled: false }]);
    appendFileSync(
      p.runsLogPath,
      JSON.stringify({ runId: "ok", jobId: "brief", event: "started", at: "2026-07-22T08:00:00Z" }) + "\n" +
        JSON.stringify({ runId: "ok", jobId: "brief", event: "succeeded", at: "2026-07-22T08:05:00Z" }) + "\n",
    );
    const { o } = opts(p, new Date("2026-07-22T09:00:00Z"));
    expect(await runSchedulerTick(o)).toEqual({ fired: false, reason: "none-due" });
  });

  it("does NOT dead-man a run interrupted by a pod RESTART (started before this boot)", async () => {
    const p = tmp();
    writeJobs(p, [{ ...brief, enabled: false }]); // no job due
    // A run started 40 min ago and never reported back — but the pod BOOTED after it
    // started (a restart killed the agent before it could report). This is not a stall.
    appendFileSync(
      p.runsLogPath,
      JSON.stringify({ runId: "interrupted", jobId: "brief", event: "started", at: "2026-07-22T08:00:00Z" }) + "\n",
    );
    const { o, injected } = opts(p, new Date("2026-07-22T08:40:00Z"), {
      bootTimeMs: Date.parse("2026-07-22T08:20:00Z"), // boot AFTER the run started
    });
    // No dead-man injected — closed out silently.
    expect(await runSchedulerTick(o)).toEqual({ fired: false, reason: "none-due" });
    expect(injected).toHaveLength(0);
    // And it's marked handled so a later tick never revisits it.
    const state = JSON.parse(readFileSync(p.statePath, "utf8")) as { stallAlerted?: string[] };
    expect(state.stallAlerted).toContain("interrupted");
    expect(await runSchedulerTick(o)).toEqual({ fired: false, reason: "none-due" });
    expect(injected).toHaveLength(0);
  });

  it("STILL dead-mans a run that genuinely hung THIS boot (started after boot)", async () => {
    const p = tmp();
    writeJobs(p, [{ ...brief, enabled: false }]);
    appendFileSync(
      p.runsLogPath,
      JSON.stringify({ runId: "hung", jobId: "brief", event: "started", at: "2026-07-22T08:00:00Z" }) + "\n",
    );
    const { o, injected } = opts(p, new Date("2026-07-22T08:40:00Z"), {
      bootTimeMs: Date.parse("2026-07-22T07:00:00Z"), // boot BEFORE the run started
    });
    expect(await runSchedulerTick(o)).toEqual({ fired: true, kind: "stall", runId: "hung" });
    expect(injected[0]).toContain("Dead-man");
  });
});
