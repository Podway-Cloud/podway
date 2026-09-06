import { describe, it, expect } from "vitest";
import { parseWindowList, targetForWindows } from "../src/signals.js";

describe("parseWindowList (cheap-tabs)", () => {
  it("parses tmux list-windows output into sorted RawWindows", () => {
    // exactly the shape `tmux list-windows -F WINDOW_FORMAT` produced in Exp 1
    const out = "0\tclaude\t0\n2\tshell\t1\n1\tcodex\t0\n";
    expect(parseWindowList(out)).toEqual([
      { index: 0, name: "claude", active: false },
      { index: 1, name: "codex", active: false },
      { index: 2, name: "shell", active: true },
    ]);
  });

  it("marks the active window", () => {
    const ws = parseWindowList("0\tmain\t1\n");
    expect(ws).toHaveLength(1);
    expect(ws[0].active).toBe(true);
  });

  it("is empty-safe and drops blank/garbage lines", () => {
    expect(parseWindowList("")).toEqual([]);
    expect(parseWindowList("\n\n")).toEqual([]);
    expect(parseWindowList("notanumber\tx\t1\n0\tok\t0")).toEqual([
      { index: 0, name: "ok", active: false },
    ]);
  });

  it("tolerates an empty window name", () => {
    expect(parseWindowList("3\t\t0")).toEqual([{ index: 3, name: "", active: false }]);
  });
});

describe("targetForWindows (agent-window targeting)", () => {
  it("targets the lowest-index window — the agent's — regardless of which is active", () => {
    // user switched to the shell (index 2 active); the agent is still window 0
    const windows = parseWindowList("0\tclaude\t0\n1\tcodex\t0\n2\tshell\t1\n");
    expect(targetForWindows("main", windows)).toBe("main:0");
  });

  it("respects a non-zero base index", () => {
    expect(targetForWindows("main", parseWindowList("1\tclaude\t1\n2\tshell\t0"))).toBe("main:1");
  });

  it("falls back to the bare session when there are no windows (single-window boot)", () => {
    expect(targetForWindows("main", [])).toBe("main");
  });
});

import { codexActivityFromDisk } from "../src/signals.js";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("codexActivityFromDisk (rollout-mtime activity)", () => {
  const seed = (ageMs: number | null): string => {
    const root = mkdtempSync(join(tmpdir(), "codex-sess-"));
    if (ageMs !== null) {
      const day = join(root, "2026", "08", "16");
      mkdirSync(day, { recursive: true });
      const f = join(day, "rollout-2026-08-16T10-00-00-abc.jsonl");
      writeFileSync(f, '{"type":"message"}\n');
      const when = (NOW - ageMs) / 1000;
      utimesSync(f, when, when); // set mtime to NOW - ageMs
    }
    return root;
  };
  const NOW = 1_760_000_000_000;

  it("fresh rollout (written seconds ago) → busy", () => {
    expect(codexActivityFromDisk(NOW, seed(5_000))).toBe("busy");
  });
  it("stale rollout (minutes ago) → idle", () => {
    expect(codexActivityFromDisk(NOW, seed(5 * 60_000))).toBe("idle");
  });
  it("no rollout at all → null (Codex present but hasn't run)", () => {
    expect(codexActivityFromDisk(NOW, seed(null))).toBeNull();
  });
})

import { lastAgentActivityMs } from "../src/signals.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("lastAgentActivityMs — honest 'last active' from transcript entries", () => {
  function claudeTranscript(root: string, name: string, lines: object[]): void {
    const dir = join(root, "proj");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  }

  it("returns ms since the NEWEST transcript entry (tool calls count), across files", () => {
    const root = mkdtempSync(join(tmpdir(), "pa-claude-"));
    const now = 1_000_000_000_000;
    // session A: last entry is a tool_result 5 min ago
    claudeTranscript(root, "a.jsonl", [
      { type: "user", timestamp: new Date(now - 3600_000).toISOString() },
      { type: "tool_result", timestamp: new Date(now - 300_000).toISOString() },
    ]);
    // session B (older): last entry 2h ago
    claudeTranscript(root, "b.jsonl", [
      { type: "assistant", timestamp: new Date(now - 2 * 3600_000).toISOString() },
    ]);
    const ms = lastAgentActivityMs(now, root, join(root, "no-codex"));
    expect(ms).toBe(300_000); // the 5-min-ago tool result is newest
  });

  it("returns null when there are no transcripts", () => {
    const root = mkdtempSync(join(tmpdir(), "pa-empty-"));
    expect(lastAgentActivityMs(Date.now(), join(root, "none"), join(root, "none2"))).toBeNull();
  });
});

import { setupProgressFromDisk } from "../src/signals.js";

describe("setupProgressFromDisk (add-deploy-progress reader)", () => {
  function seedHome(opts: {
    running?: boolean;
    done?: boolean;
    progressFile?: string;
    setupLog?: string;
  }): string {
    const home = mkdtempSync(join(tmpdir(), "pa-home-"));
    if (opts.running) writeFileSync(join(home, ".podway-setup-running"), "");
    if (opts.done) writeFileSync(join(home, ".podway-setup-done"), "");
    if (opts.progressFile !== undefined) writeFileSync(join(home, ".podway-progress"), opts.progressFile);
    if (opts.setupLog !== undefined) writeFileSync(join(home, ".podway-setup.log"), opts.setupLog);
    return home;
  }

  it("setup not started at all → null (no marker files)", () => {
    const home = seedHome({});
    expect(setupProgressFromDisk(home)).toBeNull();
  });

  it("running, marker present in ~/.podway-progress → that value", () => {
    const home = seedHome({ running: true, progressFile: "Pulling n8n…" });
    expect(setupProgressFromDisk(home)).toBe("Pulling n8n…");
  });

  it("running, only the setup log has a podway-progress line → the LAST one", () => {
    const home = seedHome({
      running: true,
      setupLog:
        "some other setup output\n" +
        "podway-progress: Pulling n8n…\n" +
        "docker: layer abc123 pulled\n" +
        "podway-progress: Starting the database…\n",
    });
    expect(setupProgressFromDisk(home)).toBe("Starting the database…");
  });

  it("~/.podway-progress wins over the log tail when both exist", () => {
    const home = seedHome({
      running: true,
      progressFile: "n8n is live",
      setupLog: "podway-progress: Pulling n8n…\n",
    });
    expect(setupProgressFromDisk(home)).toBe("n8n is live");
  });

  it("setup done → null even if a marker is still present", () => {
    const home = seedHome({ running: true, done: true, progressFile: "Pulling n8n…" });
    expect(setupProgressFromDisk(home)).toBeNull();
  });

  it("setup running but no marker emitted at all → null (env opted out)", () => {
    const home = seedHome({ running: true });
    expect(setupProgressFromDisk(home)).toBeNull();
  });

  it("sanitizes control characters and caps length, like the provider-side healthz sanitizer", () => {
    // Built from char codes at runtime (never typed as a literal control byte in this source
    // file): a couple of embedded newlines plus enough filler to exceed the 300-char cap.
    const nl = String.fromCharCode(10);
    const dirty = "Pulling n8n" + nl + "next line" + nl + "x".repeat(400);
    const home = seedHome({ running: true, progressFile: dirty });
    const out = setupProgressFromDisk(home);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(300);
    for (let i = 0; i < out!.length; i++) expect(out!.charCodeAt(i)).toBeGreaterThanOrEqual(32);
  });

  it("an empty ~/.podway-progress file falls back to the log tail", () => {
    const home = seedHome({
      running: true,
      progressFile: "   ",
      setupLog: "podway-progress: Starting the database…\n",
    });
    expect(setupProgressFromDisk(home)).toBe("Starting the database…");
  });
});
