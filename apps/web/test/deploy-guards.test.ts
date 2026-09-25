import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

/**
 * The load-bearing DEPLOY/HYGIENE guard scripts had ZERO tests, yet a bug in one of them ships
 * broken to prod or lets junk through: check-0audit.sh gates every push, and deploy-app.sh's
 * deploy-guard is the ONLY thing that stopped a stale-tree deploy from silently reverting prod
 * (the 2026-07-24 incident). This exercises the real scripts as black boxes — crafted inputs in,
 * exit code + message out — so a future edit that weakens a guard fails here instead of in prod.
 *
 * (check-migrations.sh is intentionally NOT covered: it needs a live `fly` + prod DB connection,
 * so it can't run in a hermetic unit test. Its logic is exercised by the real web deploy.)
 */
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const AUDIT = path.join(repoRoot, "scripts", "check-0audit.sh");
const DEPLOY = path.join(repoRoot, "scripts", "deploy-app.sh");

function run(cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    encoding: "utf8",
  });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}

// ── check-0audit.sh ────────────────────────────────────────────────────────────────────────────
describe("check-0audit.sh — keeps 0audit.md a living register", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "audit-guard-"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const write = (name: string, body: string) => {
    const p = path.join(dir, name);
    writeFileSync(p, body);
    return p;
  };
  const check = (p: string) => run("bash", [AUDIT, p]);

  it("passes a clean, small register", () => {
    const p = write("clean.md", "# audit\n\n- foo is fragile (file.ts)\n- bar is missing (x.ts)\n");
    expect(check(p).code).toBe(0);
  });

  it("passes a missing file (nothing to check)", () => {
    expect(check(path.join(dir, "does-not-exist.md")).code).toBe(0);
  });

  it("REFUSES strikethrough (a done item left in the register)", () => {
    const p = write("strike.md", "# audit\n\n- ~~this was fixed~~ (file.ts)\n");
    const r = check(p);
    expect(r.code).toBe(1);
    expect(r.err).toContain("strikethrough");
  });

  it("REFUSES an inline FIXED/SHIPPED marker leading a bullet in an active section", () => {
    const p = write("fixed.md", "# audit\n\n- **FIXED** the thing (file.ts)\n");
    const r = check(p);
    expect(r.code).toBe(1);
    expect(r.err).toContain("FIXED");
  });

  it("REFUSES a file over the 250-line ceiling", () => {
    const body = "# audit\n" + Array.from({ length: 260 }, (_, i) => `- item ${i} (f${i}.ts)`).join("\n") + "\n";
    const r = check(write("big.md", body));
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/lines \(> 250\)/);
  });

  it("REFUSES an overlong '## Recently shipped' breadcrumb list", () => {
    const shipped = Array.from({ length: 20 }, (_, i) => `- shipped ${i}`).join("\n");
    const body = "# audit\n\n- one live item (x.ts)\n\n## Recently shipped\n" + shipped + "\n";
    const r = check(write("crumbs.md", body));
    expect(r.code).toBe(1);
    expect(r.err).toContain("Recently shipped");
  });

  it("refuses a '## Recently shipped' section — the register is open issues only (6eec2e58)", () => {
    // This test used to ALLOW that breadcrumb; the registers refactor banned it (git log is the history).
    const body = "# audit\n\n- one live item (x.ts)\n\n## Recently shipped\n- billing console (#4)\n";
    expect(check(write("bad-crumb.md", body)).code).toBe(1);
  });
});

// ── deploy-app.sh deploy-guard ───────────────────────────────────────────────────────────────────
describe("deploy-app.sh — deploy-guard refuses a tree that isn't clean == origin/main", () => {
  let work: string;
  let origin: string;

  const git = (cwd: string, ...args: string[]) => run("git", args, { cwd });

  beforeAll(() => {
    const base = mkdtempSync(path.join(os.tmpdir(), "deploy-guard-"));
    origin = path.join(base, "origin.git");
    work = path.join(base, "work");

    // A bare origin with a `main` branch, and a clone that tracks it — the shape the guard checks.
    run("git", ["init", "--bare", "-b", "main", origin]);
    run("git", ["clone", origin, work]);
    for (const [k, v] of [["user.email", "t@t"], ["user.name", "t"]]) git(work, "config", k, v);
    mkdirSync(path.join(work, "scripts"), { recursive: true });
    // The REAL script under test, copied in so the guard cd's into THIS controlled repo.
    copyFileSync(DEPLOY, path.join(work, "scripts", "deploy-app.sh"));
    writeFileSync(path.join(work, "README.md"), "seed\n");
    git(work, "add", "-A");
    git(work, "commit", "-m", "seed");
    git(work, "push", "origin", "main");
  });
  afterAll(() => rmSync(path.dirname(origin), { recursive: true, force: true }));

  const deploy = (arg: string) =>
    run("bash", [path.join(work, "scripts", "deploy-app.sh"), arg], { cwd: work });

  it("rejects an unknown app name with usage", () => {
    const r = deploy("banana");
    expect(r.code).toBe(1);
    expect(r.err).toContain("usage:");
  });

  it("REFUSES when the working tree is dirty", () => {
    writeFileSync(path.join(work, "README.md"), "uncommitted change\n");
    const r = deploy("gateway");
    expect(r.code).toBe(1);
    expect(r.err).toContain("uncommitted changes");
    // reset for the next test
    git(work, "checkout", "--", "README.md");
  });

  it("REFUSES when local HEAD is ahead of origin/main (unpushed commit)", () => {
    writeFileSync(path.join(work, "extra.txt"), "local only\n");
    git(work, "add", "-A");
    git(work, "commit", "-m", "unpushed");
    const r = deploy("gateway");
    expect(r.code).toBe(1);
    expect(r.err).toContain("!= origin/main");
    expect(r.err).toContain("AHEAD of origin");
    // reset back to origin for any later test
    git(work, "reset", "--hard", "origin/main");
  });

  it("passes the guard (prints OK, does NOT refuse) when clean and == origin/main", () => {
    const r = deploy("gateway");
    // After the guard it proceeds to `fly deploy`, which fails here (no fly / no auth) — that's fine.
    // What we assert is the GUARD verdict: it printed OK and never refused.
    expect(r.out + r.err).toContain("deploy-guard: OK");
    expect(r.err).not.toContain("REFUSING");
  });
});
