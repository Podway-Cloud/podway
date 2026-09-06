import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";

const run = promisify(execFile);
const DOCTOR = new URL("../pod-base/podway-doctor", import.meta.url).pathname;

/**
 * The diagnostic bundle exists so support never needs a shell on a user's pod.
 * That trade is only honest if the boundary holds, so these tests assert the
 * boundary rather than the feature: what it collects, and what it must never emit.
 */
describe("podway doctor --report", () => {
  it("emits named sections — an unlabelled dump would just be a shell", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "podway-report-"));
    const { stdout } = await run("bash", [DOCTOR, "--report"], {
      env: { ...process.env, PODWAY_HOME: home },
      maxBuffer: 4_000_000,
    });
    const report = JSON.parse(stdout);
    const names = report.sections.map((s: { name: string }) => s.name);
    // Every section is named, so a reader can see exactly what was taken.
    expect(names).toContain("disk-free");
    expect(names).toContain("processes");
    expect(names).toContain("zero-byte-files");
    expect(report.sections.every((s: { name: string }) => s.name.length > 0)).toBe(true);
  });

  it("reports process NAMES, never command lines", async () => {
    // An argument can carry a token ("node server.js --key=…"). A diagnostic bundle
    // that leaks a secret is worse than the outage it was collecting.
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "podway-report-"));
    const { stdout } = await run("bash", [DOCTOR, "--report"], {
      env: { ...process.env, PODWAY_HOME: home },
      maxBuffer: 4_000_000,
    });
    const procs = JSON.parse(stdout).sections.find(
      (s: { name: string }) => s.name === "processes",
    );
    // ps -o comm gives "node", never "node /path/to/thing --flag=value".
    expect(procs.text).not.toMatch(/--\w+=/);
    expect(procs.text).not.toMatch(/\s\/\w+\/\S+\.(js|ts|sh)\b/);
  });

  it("redacts credential SHAPES out of anything it does collect", async () => {
    // The setup log is ours, but a clone URL or an echoed header could still carry
    // one; redaction is the belt to the boundary's braces.
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "podway-report-"));
    await fs.writeFile(
      path.join(home, ".podway-setup.log"),
      [
        "cloning https://x-user:supersecretvaluehere1234@github.com/a/b",
        "token=abcdefghijklmnopqrstuvwx",
        "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
        "podway: setup complete",
      ].join("\n"),
    );
    const { stdout } = await run("bash", [DOCTOR, "--report"], {
      env: { ...process.env, PODWAY_HOME: home },
      maxBuffer: 4_000_000,
    });
    const log = JSON.parse(stdout).sections.find(
      (s: { name: string }) => s.name === "podway-setup-log",
    );
    expect(log.text).not.toContain("supersecretvaluehere1234");
    expect(log.text).not.toContain("abcdefghijklmnopqrstuvwx");
    expect(log.text).toContain("REDACTED");
    // …while still being a useful log.
    expect(log.text).toContain("setup complete");
  });

  it("never reads the system journal", async () => {
    // The first version fell back to journalctl, which on a real pod returned sudo
    // lines carrying full COMMAND LINES — the exact thing the boundary excludes,
    // arriving through a section that claimed to be our own log.
    const src = await fs.readFile(DOCTOR, "utf8");
    const collectors = src.slice(src.indexOf("# ── REPORT BOUNDARY"), src.indexOf("emit_report()"));
    expect(collectors).not.toMatch(/journalctl/);
  });
});

describe("doctor findings: CLI text vs cockpit text", () => {
  const SRC = fsSync.readFileSync(new URL("../pod-base/podway-doctor", import.meta.url), "utf8");

  /**
   * The cockpit renders `ownerDetail`; its reader has no terminal. A finding whose OWNER text tells
   * them to run a command is not actionable there and reads as noise (owner report, 2026-09-06).
   * The CLI text may name commands freely — that reader is in a terminal by definition.
   */
  it("no owner-facing detail tells the reader to run a command", () => {
    // The 7th argument of add() is the owner text: it follows the `fixed` flag and a fixable flag.
    // Match continuation lines that are a bare quoted string after those flags.
    const ownerTexts = [...SRC.matchAll(/"\$?\w*fixed\w*"?\s+(?:true|false)\s+\\\n\s*"([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(ownerTexts.length, "expected some findings to carry owner wording").toBeGreaterThan(0);
    for (const t of ownerTexts) {
      expect(t, `owner text names a command: ${t}`).not.toMatch(
        /'podway[ -]|podway (doctor|dev|startup|agent|secrets|relay|msg)\b|--fix\b/,
      );
    }
  });

  it("emits ownerDetail in --json so the cockpit has something to render", () => {
    expect(SRC).toContain('"ownerDetail":"%s"');
    // It must DEFAULT to the CLI detail — a check without its own wording still has to render.
    expect(SRC).toMatch(/\$\{7:-\$4\}|\$\{owner:-\$detail\}/);
  });
});
