import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decide, freshState, parseQuestionScreen, lastOwnerMessageAt, autopilotTick,
  WAKE_IDLE_MS, WAKE_COOLDOWN_MS, WAKES_PER_DAY, PICK_WAIT_MS, WAKE_TEXT, type Observation,
} from "../src/autopilot.js";

const MIN = 60_000;
const T0 = Date.parse("2026-10-11T08:00:00Z");
const obs = (o: Partial<Observation> = {}): Observation => ({
  now: T0, spec: { wake: true, autopick: false }, status: "idle", waitingFor: undefined, idleMs: WAKE_IDLE_MS + MIN,
  workMarker: "m1", lastOwnerMessageAt: null, ...o,
});

// Real screens captured from Claude Code 2.1.283 on test:1 (2026-10-11).
const Q_MULTI_1 = [
  "←  ☐ Color  ☐ Size  ✔ Submit  →",
  "",
  "Which color?",
  "",
  "❯ 1. Blue (Recommended)",
  "     Blue",
  "  2. Red",
  "     Red",
  "  3. Type something.",
  "────────────────────",
  "  4. Chat about this",
  "",
  "Enter to select · Tab/Arrow keys to navigate · Esc to cancel",
].join("\n");
const Q_MULTI_2 = Q_MULTI_1.replace("☐ Color", "☒ Color").replace("Which color?", "Which size?").replace(/Blue/g, "Small").replace(/Red/g, "Large");
const REVIEW = [
  "←  ☒ Color  ☒ Size  ✔ Submit  →",
  "Review your answers",
  " ● Which color?",
  "   → Blue (Recommended)",
  " ● Which size?",
  "   → Small (Recommended)",
  "Ready to submit your answers?",
  "❯ 1. Submit answers",
  "  2. Cancel",
].join("\n");
const Q_SINGLE = [
  "Which pet?",
  "❯ 1. Cat (Recommended)",
  "     Cat",
  "  2. Dog",
  "     Dog",
  "  3. Type something.",
  "Enter to select · ↑/↓ to navigate · Esc to cancel",
].join("\n");

describe("autopilot wake (the pod's own 'next?')", () => {
  it("wakes an idle agent that is not waiting for the owner", () => {
    expect(decide(freshState(), obs()).action.kind).toBe("wake");
  });
  it("never wakes: wake off, agent working, waiting for the owner, or not idle long enough", () => {
    expect(decide(freshState(), obs({ spec: { wake: false, autopick: false } })).action.kind).toBe("none");
    expect(decide(freshState(), obs({ status: "busy" })).action.kind).toBe("none");
    expect(decide(freshState(), obs({ waitingFor: "dialog open" })).action.kind).toBe("none");
    expect(decide(freshState(), obs({ idleMs: WAKE_IDLE_MS - MIN })).action.kind).toBe("none");
  });
  it("respects the cooldown and the daily cap", () => {
    const after = decide(freshState(), obs()).state;
    expect(decide(after, obs({ now: T0 + WAKE_COOLDOWN_MS - MIN, workMarker: "m2" })).action.kind).toBe("none");
    let s = freshState();
    let woke = 0;
    for (let i = 0; i < 20; i++) {
      const r = decide(s, obs({ now: T0 + i * (WAKE_COOLDOWN_MS + MIN), workMarker: `m${i}` }));
      if (r.action.kind === "wake") woke++;
      s = r.state;
    }
    expect(woke).toBe(WAKES_PER_DAY);
  });
  it("pauses after 2 empty wakes (nothing changed in ~/work) until the owner writes", () => {
    let s = decide(freshState(), obs()).state;
    const step = (i: number, o: Partial<Observation> = {}) => {
      const r = decide(s, obs({ now: T0 + i * (WAKE_COOLDOWN_MS + MIN), ...o }));
      s = r.state;
      return r.action.kind;
    };
    expect(step(1)).toBe("wake");
    expect(step(2)).toBe("none");
    expect(step(3)).toBe("none");
    expect(step(4, { lastOwnerMessageAt: T0 + 4 * (WAKE_COOLDOWN_MS + MIN) - MIN })).toBe("wake");
  });
  it("a wake that led to real work resets the empty streak", () => {
    let s = decide(freshState(), obs()).state;
    s = decide(s, obs({ now: T0 + WAKE_COOLDOWN_MS + MIN, workMarker: "changed" })).state;
    expect(s.emptyStreak).toBe(0);
  });
});

describe("autopilot pick ('always choose recommended', opt-in)", () => {
  const ask = (o: Partial<Observation>) => obs({ spec: { wake: false, autopick: true }, waitingFor: "input needed", ...o });
  it("waits PICK_WAIT_MS so the owner can answer first, then tries once per question box", () => {
    let s = decide(freshState(), ask({})).state;
    expect(decide(s, ask({ now: T0 + PICK_WAIT_MS - MIN })).action.kind).toBe("none");
    const r = decide(s, ask({ now: T0 + PICK_WAIT_MS + MIN }));
    expect(r.action).toEqual({ kind: "pick" });
    s = r.state;
    expect(decide(s, ask({ now: T0 + PICK_WAIT_MS + 2 * MIN })).action.kind).toBe("none");
  });
  it("autopick off → never", () => {
    const off = { spec: { wake: true, autopick: false } };
    const s = decide(freshState(), ask(off)).state;
    expect(decide(s, ask({ ...off, now: T0 + PICK_WAIT_MS + MIN })).action.kind).toBe("none");
  });
  it("an open question blocks the wake", () => {
    expect(decide(freshState(), obs({ waitingFor: "input needed" })).action.kind).toBe("none");
  });
});

describe("reading the question box off the screen (real Claude Code screens)", () => {
  it("recommended + highlighted option 1 → pickable; a review of recommended answers → pickable", () => {
    expect(parseQuestionScreen(Q_MULTI_1)).toMatchObject({ kind: "question", pickable: true });
    expect(parseQuestionScreen(Q_MULTI_2)).toMatchObject({ kind: "question", pickable: true });
    expect(parseQuestionScreen(Q_SINGLE)).toMatchObject({ kind: "question", pickable: true });
    expect(parseQuestionScreen(REVIEW)).toMatchObject({ kind: "review", pickable: true });
  });
  it("owner decisions are never pickable", () => {
    expect(parseQuestionScreen(Q_SINGLE.replace("Cat (Recommended)", "Cat"))).toMatchObject({ pickable: false });
    expect(parseQuestionScreen(Q_SINGLE.replace("Which pet?", "Deploy to production now?"))).toMatchObject({ pickable: false });
    expect(parseQuestionScreen(Q_SINGLE.replace("  2. Dog", "  2. Merge the branch"))).toMatchObject({ pickable: false });
    expect(parseQuestionScreen(Q_SINGLE.replace("❯ 1. Cat", "  1. Cat").replace("  2. Dog", "❯ 2. Dog"))).toMatchObject({ pickable: false });
    expect(parseQuestionScreen(REVIEW.replace("→ Small (Recommended)", "→ Large"))).toMatchObject({ kind: "review", pickable: false });
    expect(parseQuestionScreen("$ ls\nfile.txt")).toEqual({ kind: "other" });
  });
});

describe("transcript reading", () => {
  it("the owner's last message ignores our own wake text", () => {
    const line = (o: unknown) => JSON.stringify(o);
    const t = [
      line({ type: "user", timestamp: "2026-10-11T08:00:00Z", message: { content: "do the thing" } }),
      line({ type: "user", timestamp: "2026-10-11T09:00:00Z", message: { content: WAKE_TEXT } }),
    ].join("\n");
    expect(lastOwnerMessageAt(t)).toBe(Date.parse("2026-10-11T08:00:00Z"));
  });
});

describe("autopilotTick presses Enter only on verified screens", () => {
  const run = async (screens: string[]) => {
    const dir = mkdtempSync(join(tmpdir(), "ap-"));
    let i = 0, enters = 0, now = T0;
    const deps = {
      now: () => now, spec: () => ({ wake: false, autopick: true }),
      status: () => (i < screens.length ? { status: "waiting", waitingFor: "input needed" } : { status: "idle" }),
      idleMs: () => 0, transcript: () => "", screen: async () => screens[i] ?? "",
      workMarker: async () => "m", inject: async () => undefined,
      enter: async () => { enters++; i++; },
      sleep: async () => undefined, statePath: join(dir, "s.json"),
    };
    await autopilotTick(deps);
    now = T0 + PICK_WAIT_MS + MIN;
    await autopilotTick(deps);
    return enters;
  };
  it("2 questions: Enter, Enter, Enter on review — then the box is closed", async () => {
    expect(await run([Q_MULTI_1, Q_MULTI_2, REVIEW])).toBe(3);
  });
  it("stops at the first non-pickable screen — the review is never submitted", async () => {
    expect(await run([Q_MULTI_1, Q_MULTI_2.replace("Small (Recommended)", "Small"), REVIEW])).toBe(1);
  });
});
