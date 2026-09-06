import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOOK = new URL("../pod-base/hooks/relentless-stop.py", import.meta.url).pathname;

interface Opts {
  /** Unticked items in the agent's register. Empty = a legal, reachable idle. */
  items?: string[];
  /** `hold` switch. Undefined writes NO config at all — the off-by-default case. */
  hold?: boolean;
  /** Lines of THIS turn's transcript (tool calls the hook inspects). */
  turn?: string[];
  /** Lines of earlier turns, to prove scoping. */
  prior?: string[];
}

/**
 * Every run gets a THROWAWAY HOME.
 *
 * The hook reads its switches and register from the home directory, so without this a test would
 * read the developer's real config and pass or fail on machine state — the same trap that made the
 * greeter suite depend on machine history (2026-09-06).
 */
function run(lastMessage: string, o: Opts = {}): { home: string; out: string } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "relentless-home-"));
  fs.mkdirSync(path.join(home, ".podway"), { recursive: true });
  if (o.hold !== undefined) {
    fs.writeFileSync(path.join(home, ".podway", "relentless.json"), JSON.stringify({ hold: o.hold }));
  }
  if (o.items?.length) {
    fs.writeFileSync(
      path.join(home, ".podway", "register.md"),
      o.items.map((i) => `- [ ] ${i}`).join("\n") + "\n",
    );
  }
  const t = path.join(home, "t.jsonl");
  fs.writeFileSync(
    t,
    [...(o.prior ?? []), JSON.stringify({ role: "user", content: "go" }), ...(o.turn ?? [])].join("\n") + "\n",
  );
  const out = execFileSync("python3", [HOOK], {
    input: JSON.stringify({ last_assistant_message: lastMessage, transcript_path: t }),
    encoding: "utf8",
    env: { ...process.env, HOME: home },
  });
  return { home, out };
}

const blocked = (out: string) => out.includes('"decision": "block"');

/**
 * The hook is the ONLY enforcing part of relentless — everything else is advisory text that loses to
 * the model's prior to yield after answering. Measured on a live session (2026-09-06): 748 of ~1508
 * turns ended as plain stops, so the default flipped from allow to BLOCK-UNLESS-EARNED.
 */
describe("relentless stop hook — a stop must be EARNED", () => {
  it("is OFF when no config exists — a pod never inherits a wall by accident", () => {
    expect(blocked(run("Done.", { items: ["something open"] }).out)).toBe(false);
  });

  it("is OFF when hold is explicitly false", () => {
    expect(blocked(run("Done.", { hold: false, items: ["something open"] }).out)).toBe(false);
  });

  it("BLOCKS a plain stop while work is open, and NAMES the next item", () => {
    const { out } = run("All done, tests pass.", {
      hold: true,
      items: ["Deploy podway-web", "Add the relay token"],
    });
    expect(blocked(out)).toBe(true);
    // A generic "keep working" is the exact gap the agent fills with another status report.
    expect(out).toContain("Deploy podway-web");
    expect(out).toContain("1 more open");
  });

  it("ALLOWS when the register is empty — idle is reachable, never assumed", () => {
    expect(blocked(run("Done.", { hold: true }).out)).toBe(false);
  });

  it("ALLOWS when a background task is running in THIS turn", () => {
    const turn = [JSON.stringify({ role: "assistant", input: { run_in_background: true } })];
    expect(blocked(run("Started it.", { hold: true, items: ["x"], turn }).out)).toBe(false);
  });

  it("ALLOWS when AskUserQuestion was used in THIS turn", () => {
    const turn = [JSON.stringify({ role: "assistant", content: "AskUserQuestion" })];
    expect(blocked(run("Which one?", { hold: true, items: ["x"], turn }).out)).toBe(false);
  });

  it("BLOCKS even though an EARLIER turn used AskUserQuestion", () => {
    // The hole that made it "sometimes work": a flat tail scan let one AskUserQuestion anywhere in
    // ~400KB excuse every later stop. A live session's tail held 18 of them.
    const prior = [JSON.stringify({ role: "assistant", content: "AskUserQuestion earlier" })];
    expect(blocked(run("Fixed it.", { hold: true, items: ["x"], prior }).out)).toBe(true);
  });

  it("YIELDS after repeated blocks with no reply, and STAYS yielded", () => {
    // A wall that cannot be escaped is worse than no wall: the owner may have stepped away, and a
    // pod cannot argue its way out of a loop. Resetting the streak on yield made it OSCILLATE —
    // three blocks, a yield, three more — which is a loop wearing an escape's clothes.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "relentless-yield-"));
    fs.mkdirSync(path.join(home, ".podway"), { recursive: true });
    fs.writeFileSync(path.join(home, ".podway", "relentless.json"), JSON.stringify({ hold: true }));
    fs.writeFileSync(path.join(home, ".podway", "register.md"), "- [ ] still open\n");
    const t = path.join(home, "t.jsonl");
    fs.writeFileSync(t, JSON.stringify({ role: "user", content: "go" }) + "\n");
    const once = () =>
      execFileSync("python3", [HOOK], {
        input: JSON.stringify({ last_assistant_message: "Done.", transcript_path: t }),
        encoding: "utf8",
        env: { ...process.env, HOME: home },
      });
    const seen = [once(), once(), once(), once(), once()];
    expect(seen.slice(0, 3).every(blocked)).toBe(true);
    expect(seen[3]).toContain("YIELDING");
    expect(blocked(seen[4])).toBe(false); // stays yielded until the user speaks
  });

  it("ALLOWS when the runtime's own loop-breaker has engaged", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "relentless-active-"));
    fs.mkdirSync(path.join(home, ".podway"), { recursive: true });
    fs.writeFileSync(path.join(home, ".podway", "relentless.json"), JSON.stringify({ hold: true }));
    fs.writeFileSync(path.join(home, ".podway", "register.md"), "- [ ] open\n");
    const t = path.join(home, "t.jsonl");
    fs.writeFileSync(t, JSON.stringify({ role: "user", content: "go" }) + "\n");
    const out = execFileSync("python3", [HOOK], {
      input: JSON.stringify({ last_assistant_message: "Done.", transcript_path: t, stop_hook_active: true }),
      encoding: "utf8",
      env: { ...process.env, HOME: home },
    });
    expect(blocked(out)).toBe(false);
  });

  it("FAILS SAFE on an unreadable register rather than wedging the session", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "relentless-bad-"));
    fs.mkdirSync(path.join(home, ".podway"), { recursive: true });
    fs.writeFileSync(path.join(home, ".podway", "relentless.json"), JSON.stringify({ hold: true }));
    fs.writeFileSync(path.join(home, ".podway", "register.md"), Buffer.from([0xff, 0xfe, 0x00, 0x01]));
    const t = path.join(home, "t.jsonl");
    fs.writeFileSync(t, JSON.stringify({ role: "user", content: "go" }) + "\n");
    const out = execFileSync("python3", [HOOK], {
      input: JSON.stringify({ last_assistant_message: "Done.", transcript_path: t }),
      encoding: "utf8",
      env: { ...process.env, HOME: home },
    });
    expect(blocked(out)).toBe(false);
  });

  it("ignores ticked and struck-through items", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "relentless-ticked-"));
    fs.mkdirSync(path.join(home, ".podway"), { recursive: true });
    fs.writeFileSync(path.join(home, ".podway", "relentless.json"), JSON.stringify({ hold: true }));
    fs.writeFileSync(
      path.join(home, ".podway", "register.md"),
      "- [x] already done\n- [ ] ~~cancelled~~\n",
    );
    const t = path.join(home, "t.jsonl");
    fs.writeFileSync(t, JSON.stringify({ role: "user", content: "go" }) + "\n");
    const out = execFileSync("python3", [HOOK], {
      input: JSON.stringify({ last_assistant_message: "Done.", transcript_path: t }),
      encoding: "utf8",
      env: { ...process.env, HOME: home },
    });
    expect(blocked(out)).toBe(false);
  });
});
