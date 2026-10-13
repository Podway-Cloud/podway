import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createLogger } from "@podway/shared/log";

/**
 * Autopilot (owner, 2026-10-11) — the pod's own "next?" and an opt-in "always choose recommended".
 *
 *  WAKE  (spec.relentless.wake): the agent is idle ≥ WAKE_IDLE_MS, NOT waiting for the owner, under the
 *        daily cap and the cooldown → type WAKE_TEXT, like the owner typing "next?". Two wakes in a row
 *        that change nothing in ~/work (no commit, no edited file) → paused until the owner writes.
 *  PICK  (spec.relentless.autopick): a multiple-choice question has waited ≥ PICK_WAIT_MS → select the
 *        first option of every question, ONLY when each first option is marked "(Recommended)" and no
 *        question mentions a gated action. The pod rules tell agents to mark NO option recommended on an
 *        owner decision (push/deploy/delete/spend/publish, or "what next?"), so those are never picked.
 *        This exact behaviour happened by ACCIDENT on 2026-10-06 (merges + live writes nobody approved),
 *        so it is off by default, warned in the UI, and fenced twice (marker + RISKY).
 */
export const WAKE_IDLE_MS = 20 * 60_000;
export const WAKE_COOLDOWN_MS = 20 * 60_000;
export const WAKES_PER_DAY = 8;
export const EMPTY_WAKES_TO_PAUSE = 2;
export const PICK_WAIT_MS = 10 * 60_000;
export const RISKY =
  /\b(push|deploy|merge|delete|destroy|drop|remove|publish|release|pay|payment|charge|spend|buy|purchase|prod|production|send|email|post|tweet|secret|password|credential|rm -rf|force)\b/i;

export const WAKE_TEXT =
  "next? (Autopilot: you have been idle for a while. Do the most valuable next thing. If nothing is worth doing, or the next step is the owner's decision, ask ONE question with AskUserQuestion and mark NO option as (Recommended) — then wait.)";

export interface AutopilotState {
  day: string;
  wakesToday: number;
  lastWakeAt: number;
  /** ~/work fingerprint at the last wake — unchanged at the next one ⇒ that wake was empty. */
  markerAtWake: string | null;
  emptyStreak: number;
  /** Paused after EMPTY_WAKES_TO_PAUSE empty wakes; cleared by an owner message newer than this. */
  pausedAt: number | null;
  /** When the current open question was first seen (for PICK_WAIT_MS). */
  questionSince: number | null;
  /** The question already auto-picked (never press keys twice for one question). */
  pickedKey: string | null;
}

export const freshState = (): AutopilotState => ({
  day: "", wakesToday: 0, lastWakeAt: 0, markerAtWake: null, emptyStreak: 0, pausedAt: null, questionSince: null, pickedKey: null,
});

export interface Observation {
  now: number;
  spec: { wake: boolean; autopick: boolean };
  status?: string;
  waitingFor?: string;
  /** ms since the agent last wrote to its transcript (null = never). */
  idleMs: number | null;
  /** Fingerprint of ~/work (HEAD + dirty files). */
  workMarker: string;
  /** Time of the newest owner-written message (not our wake) in the transcript, or null. */
  lastOwnerMessageAt: number | null;
}

export type Action = { kind: "none"; why: string } | { kind: "wake" } | { kind: "pick" };

/** Pure decision + next state. One action per tick. */
export function decide(s0: AutopilotState, o: Observation): { action: Action; state: AutopilotState } {
  const s: AutopilotState = { ...s0 };
  const day = new Date(o.now).toISOString().slice(0, 10);
  if (s.day !== day) {
    s.day = day;
    s.wakesToday = 0;
  }
  if (s.pausedAt !== null && o.lastOwnerMessageAt !== null && o.lastOwnerMessageAt > s.pausedAt) {
    s.pausedAt = null;
    s.emptyStreak = 0;
  }

  const asking = o.waitingFor === "input needed";
  if (!asking) s.questionSince = null;
  else if (s.questionSince === null) s.questionSince = o.now;

  // PICK first: an open question blocks everything else.
  if (asking) {
    // An open question box is identified by when it was first seen; the tick checks every SCREEN before
    // each key (Claude Code writes the question to the transcript only AFTER it is answered).
    const key = String(s.questionSince);
    if (!o.spec.autopick) return { action: { kind: "none", why: "question open; autopick off" }, state: s };
    if (s.pickedKey === key) return { action: { kind: "none", why: "already tried this question" }, state: s };
    if (o.now - (s.questionSince ?? o.now) < PICK_WAIT_MS) return { action: { kind: "none", why: "giving the owner time" }, state: s };
    s.pickedKey = key;
    return { action: { kind: "pick" }, state: s };
  }

  if (!o.spec.wake) return { action: { kind: "none", why: "wake off" }, state: s };
  if (o.waitingFor) return { action: { kind: "none", why: `waiting: ${o.waitingFor}` }, state: s };
  if (o.status === "busy" || o.status === "shell") return { action: { kind: "none", why: "working" }, state: s };
  if (o.idleMs === null || o.idleMs < WAKE_IDLE_MS) return { action: { kind: "none", why: "not idle long enough" }, state: s };
  if (o.now - s.lastWakeAt < WAKE_COOLDOWN_MS) return { action: { kind: "none", why: "cooldown" }, state: s };
  if (s.pausedAt !== null) return { action: { kind: "none", why: "paused after empty wakes — waiting for the owner" }, state: s };
  if (s.wakesToday >= WAKES_PER_DAY) return { action: { kind: "none", why: "daily cap" }, state: s };

  // Was the previous wake empty (nothing changed in ~/work since it)?
  if (s.markerAtWake !== null) {
    s.emptyStreak = s.markerAtWake === o.workMarker ? s.emptyStreak + 1 : 0;
    if (s.emptyStreak >= EMPTY_WAKES_TO_PAUSE) {
      s.pausedAt = o.now;
      s.markerAtWake = null;
      return { action: { kind: "none", why: "paused: wakes produced no work" }, state: s };
    }
  }
  s.lastWakeAt = o.now;
  s.wakesToday += 1;
  s.markerAtWake = o.workMarker;
  return { action: { kind: "wake" }, state: s };
}

// ---------------------------------------------------------------- IO (thin; the logic is `decide`)

const log = createLogger("autopilot");

export type Screen =
  | { kind: "question"; pickable: boolean; why: string }
  | { kind: "review"; pickable: boolean; why: string }
  | { kind: "other" };

/**
 * Read Claude Code's question box off the agent's terminal (verified layout, Claude Code 2.1.283):
 *   [←  ☐ Color  ☐ Size  ✔ Submit  →]   ← tab bar, only for 2+ questions
 *   Which color?
 *   ❯ 1. Blue (Recommended)
 *        <description>
 *     2. Red
 *   Enter to select · …
 * and the review screen ("Review your answers" … "→ Blue (Recommended)" … "❯ 1. Submit answers").
 * Pickable = the HIGHLIGHTED option is option 1 and ends in "(Recommended)", nothing gated is mentioned,
 * and it is not a multi-select box. Anything else → not pickable (the owner answers).
 */
export function parseQuestionScreen(pane: string): Screen {
  const lines = pane.split("\n").map((l) => l.replace(/\s+$/, ""));
  const text = lines.join("\n");
  if (/Review your answers/.test(text) && /Submit answers/.test(text)) {
    const answers = lines.filter((l) => /^\s*→\s/.test(l)).map((l) => l.replace(/^\s*→\s*/, ""));
    if (!answers.length) return { kind: "review", pickable: false, why: "no answers listed" };
    if (!answers.every((a) => /\(recommended\)$/i.test(a))) return { kind: "review", pickable: false, why: "an answer is not the recommended one" };
    if (RISKY.test(text)) return { kind: "review", pickable: false, why: "mentions a gated action" };
    if (!/❯\s*1\.\s*Submit answers/.test(text)) return { kind: "review", pickable: false, why: "Submit is not highlighted" };
    return { kind: "review", pickable: true, why: "all recommended" };
  }
  const hint = lines.findIndex((l) => /Enter to select/.test(l));
  if (hint < 0) return { kind: "other" };
  const first = lines.findIndex((l) => /^\s*(?:❯\s*)?1\.\s/.test(l));
  if (first < 0) return { kind: "question", pickable: false, why: "no options found" };
  if (!/^\s*❯\s*1\.\s/.test(lines[first]!)) return { kind: "question", pickable: false, why: "option 1 is not highlighted" };
  const label = lines[first]!.replace(/^\s*❯\s*1\.\s*/, "");
  if (/^\[.?\]|^[☐☒◻◼✔]/.test(label) || /\[[ x✔]\]/.test(text.slice(text.indexOf(lines[first]!)))) {
    return { kind: "question", pickable: false, why: "multi-select" };
  }
  if (!/\(recommended\)$/i.test(label)) return { kind: "question", pickable: false, why: "no recommended first option" };
  // The question text + the whole option list (up to the hint line) must not mention a gated action.
  let top = first - 1;
  while (top > 0 && lines[top]!.trim() === "") top--;
  const block = lines.slice(Math.max(0, top - 3), hint).join(" ");
  if (RISKY.test(block)) return { kind: "question", pickable: false, why: "mentions a gated action" };
  return { kind: "question", pickable: true, why: "recommended" };
}

/** Newest owner-written prompt (a plain user text that is not our wake), ms epoch; null if none. */
export function lastOwnerMessageAt(jsonl: string): number | null {
  let at: number | null = null;
  for (const line of jsonl.trim().split("\n").slice(-400)) {
    try {
      const e = JSON.parse(line) as { type?: string; timestamp?: string; message?: { content?: unknown } };
      if (e.type !== "user" || !e.timestamp) continue;
      const c = e.message?.content;
      const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((x: { text?: string }) => x?.text ?? "").join("") : "";
      if (text && !text.startsWith("next? (Autopilot")) at = Date.parse(e.timestamp);
    } catch {
      /* skip */
    }
  }
  return at;
}

export function readState(p: string): AutopilotState {
  try {
    return { ...freshState(), ...JSON.parse(readFileSync(p, "utf8")) };
  } catch {
    return freshState();
  }
}

export function writeState(p: string, s: AutopilotState): void {
  try {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(s));
  } catch (e) {
    log.warn("autopilot_state_write_failed", { err: e instanceof Error ? e.message : String(e) });
  }
}

export const sh = (cmd: string, args: string[], opts: { uid?: number; gid?: number } = {}): Promise<string> =>
  new Promise((resolve) => execFile(cmd, args, { maxBuffer: 1 << 20, timeout: 10_000, ...opts }, (err, out) => resolve(err ? "" : out)));

export interface AutopilotDeps {
  now: () => number;
  spec: () => { wake: boolean; autopick: boolean };
  status: () => { status?: string; waitingFor?: string };
  idleMs: () => number | null;
  transcript: () => string;
  /** The agent window's visible text (tmux capture-pane). */
  screen: () => Promise<string>;
  workMarker: () => Promise<string>;
  /** Type text + Enter into the agent window. */
  inject: (text: string) => Promise<void>;
  /** Press Enter once in the agent window. */
  enter: () => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  statePath: string;
}

/**
 * One autopilot tick. PICK presses Enter ONE at a time and re-reads the session state after each: every
 * Enter selects the highlighted (first) option and moves on; a multi-question box ends on a review
 * screen that one more Enter submits; a one-question box submits on its first Enter (verified live on
 * Claude Code 2.1.283, 2026-10-11). It stops the moment the question box closes — never a stray key.
 */
export async function autopilotTick(d: AutopilotDeps): Promise<Action> {
  const st = d.status();
  const jsonl = d.transcript();
  const { action, state } = decide(readState(d.statePath), {
    now: d.now(),
    spec: d.spec(),
    status: st.status,
    waitingFor: st.waitingFor,
    idleMs: d.idleMs(),
    workMarker: await d.workMarker(),
    lastOwnerMessageAt: lastOwnerMessageAt(jsonl),
  });
  writeState(d.statePath, state);
  if (action.kind === "wake") {
    log.info("autopilot_wake", { wakesToday: state.wakesToday });
    await d.inject(WAKE_TEXT);
  } else if (action.kind === "pick") {
    // One Enter per verified screen; stop at the first screen that is not pickable (nothing is submitted
    // then — the box stays open for the owner) or when the box closes. Bounded.
    let presses = 0;
    let stopped = "";
    for (let i = 0; i < 12; i++) {
      if (d.status().waitingFor !== "input needed") break;
      const sc = parseQuestionScreen(await d.screen());
      if (sc.kind === "other" || !sc.pickable) {
        stopped = sc.kind === "other" ? "not a question screen" : sc.why;
        break;
      }
      await d.enter();
      presses++;
      await d.sleep(1500);
    }
    log.info("autopilot_pick", { presses, stopped: stopped || null, closed: d.status().waitingFor !== "input needed" });
  }
  return action;
}

