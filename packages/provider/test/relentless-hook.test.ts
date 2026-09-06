import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOOK = new URL("../pod-base/hooks/relentless-stop.py", import.meta.url).pathname;

/** Run the hook with a transcript containing `turnLines` since the last user message. */
function run(lastMessage: string, priorSession: string[] = [], thisTurn: string[] = []): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relentless-"));
  const t = path.join(dir, "t.jsonl");
  fs.writeFileSync(
    t,
    [...priorSession, JSON.stringify({ role: "user", content: "go" }), ...thisTurn].join("\n") + "\n",
  );
  try {
    return execFileSync("python3", [HOOK], {
      input: JSON.stringify({ last_assistant_message: lastMessage, transcript_path: t }),
      encoding: "utf8",
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The hook is the only part of `relentless` that does not rely on the agent remembering. Two holes
 * made it silent exactly when it mattered, both measured on a live session (2026-09-06).
 */
describe("relentless stop hook", () => {
  it("BLOCKS a prose question even when an earlier TURN used AskUserQuestion", () => {
    // The hole that made it "sometimes work": it scanned a flat transcript tail, so one
    // AskUserQuestion anywhere in ~400KB excused every later stop. A live session's tail held 18.
    const prior = [JSON.stringify({ role: "assistant", content: "AskUserQuestion earlier" })];
    expect(run("Fixed it.\n\nWant me to deploy?", prior)).toContain('"decision": "block"');
  });

  it("ALLOWS when AskUserQuestion was used in THIS turn", () => {
    const turn = [JSON.stringify({ role: "assistant", content: "AskUserQuestion" })];
    expect(run("Which one do you want?", [], turn)).toBe("");
  });

  it("BLOCKS an ask followed by a status board — the commonest evasion", () => {
    expect(
      run("Fixed it.\n\nWant me to deploy?\n\n## Board\n- v0.8.4 live\n- 30 items open\n\nNothing is on fire."),
    ).toContain('"decision": "block"');
  });

  it("ALLOWS a genuine report with no ask", () => {
    expect(run("Deployed and verified. Fleet on 0.8.4.\n\n## Board\n- all green")).toBe("");
  });

  it("ALLOWS a rhetorical question inside a report", () => {
    expect(run("Why did it fail? The cert was never issued.\n\nFixed and verified.")).toBe("");
  });

  it("ALLOWS when a background task was started in this turn", () => {
    const turn = [JSON.stringify({ tool: "Bash", input: { run_in_background: true } })];
    expect(run("Building now. Want me to deploy after?", [], turn)).toBe("");
  });

  it("fails OPEN on junk input — a broken hook must never wedge a session", () => {
    const out = execFileSync("python3", [HOOK], { input: "not json", encoding: "utf8" });
    expect(out).toBe("");
  });
});
