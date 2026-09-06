import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Job } from "./types";

// The pod-agent scheduler owns these files and writes them to ~/.podway (pod-agent/src/main.ts:
// `opsDir = path.join(home, ".podway")`). This app read `process.cwd()/.podbay` — a path nothing
// has ever written, so the dashboard showed no jobs and no runs. Resolve the SAME directory the
// writer uses; PODWAY_OPS_DIR overrides it for local dev outside a pod.
const OPS_DIR = process.env.PODWAY_OPS_DIR ?? path.join(os.homedir(), ".podway");
const DIR = OPS_DIR;
const FILE = path.join(DIR, "ops-jobs.json");

export async function listJobs(): Promise<Job[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, "utf8")) as { jobs?: Job[] };
    return Array.isArray(parsed.jobs) ? parsed.jobs : [];
  } catch {
    return [];
  }
}

export async function writeJobs(jobs: Job[]): Promise<Job[]> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify({ jobs }, null, 2));
  return jobs;
}

/** Toggle one job's `enabled` (the dashboard's job switch). */
export async function setJobEnabled(id: string, enabled: boolean): Promise<Job[]> {
  const jobs = await listJobs();
  const next = jobs.map((j) => (j.id === id ? { ...j, enabled } : j));
  return writeJobs(next);
}
