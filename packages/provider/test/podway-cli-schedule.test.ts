import { describe, it, expect, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cli = process.env.PODWAY_CLI ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "pod-base", "podway");
let dir: string;
const run = (...args: string[]) =>
  spawnSync("bash", [cli, ...args], {
    encoding: "utf8",
    // Port 9 (discard): if a command tries to reach the pod-agent, it fails instead of filing anything.
    env: { ...process.env, HOME: dir, PODWAY_OPS_JOBS: path.join(dir, "jobs.json"), PODWAY_AGENT_PORT: "9" },
  });
const jobs = () => JSON.parse(readFileSync(path.join(dir, "jobs.json"), "utf8")).jobs;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "podway-sched-"));
});

describe("podway schedule one-shots (makore.app prod, 2026-09-03)", () => {
  it("--in N schedules ONE run N minutes from now", () => {
    const r = run("schedule", "add", "--name", "wake", "--in", "5", "--do", "check the deploy");
    expect(r.status).toBe(0);
    const at = Date.parse(jobs()[0].schedule.at);
    expect(Math.abs(at - (Date.now() + 5 * 60_000))).toBeLessThan(60_000);
    expect(jobs()[0].schedule.times).toBeUndefined();
  });
  it("--once --at HH:MM picks the NEXT such time in --tz, never a past one", () => {
    expect(run("schedule", "add", "--name", "w", "--once", "--at", "23:59", "--tz", "UTC", "--do", "x").status).toBe(0);
    const at = new Date(jobs()[0].schedule.at);
    expect(at.getTime()).toBeGreaterThan(Date.now());
    expect(at.getTime() - Date.now()).toBeLessThanOrEqual(24 * 3_600_000);
    expect(at.toISOString().slice(11, 16)).toBe("23:59");
  });
  it("rejects a one-shot mixed with a recurring flag", () => {
    expect(run("schedule", "add", "--name", "w", "--in", "5", "--every", "10", "--do", "x").status).not.toBe(0);
    expect(run("schedule", "add", "--name", "w", "--once", "--do", "x").status).not.toBe(0);
  });
  it("schedule list shows each job's task (makore.app dev, 2026-09-06)", () => {
    run("schedule", "add", "--name", "wake", "--in", "5", "--do", "check the deploy");
    const out = run("schedule", "list").stdout;
    expect(out).toContain("once at ");
    expect(out).toContain("do: check the deploy");
  });
});

describe("--help never acts", () => {
  it("podway bug --help prints usage instead of filing a report (2026-10-01)", () => {
    const r = run("bug", "--help");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('bug "<what went wrong>"');
    expect(r.stderr).not.toContain("pod-agent");
  });
  it("podway msg send x --help prints usage instead of sending", () => {
    const r = run("msg", "send", "x", "--help");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("msg send <pod> <text>");
  });
});
