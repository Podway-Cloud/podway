/**
 * Context-overflow recovery: strip the un-compactable payloads from a Claude Code transcript so a
 * stuck session can compact and continue.
 *
 * A base64 image tool-result is ~330k tokens and CANNOT be summarized by auto-compaction — a
 * screenshot-heavy 24/7 session therefore fills the context and every turn dies with "prompt is too
 * long" (makore.app dev, 2026-09-10). The fix a human did by hand — replace each image node with a
 * tiny text placeholder, then let the session compact — is captured here so the watchdog can do it
 * automatically. Text tool-results are LEFT alone: they are compactable, so they are not the bomb.
 */
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { atContextLimit } from "@podway/shared/pane";

const PLACEHOLDER_TEXT = "[screenshot removed by podway to fit the context window]";

/** Recursively replace every `{type:"image",...}` node in a parsed transcript object with a small
 * text node, in place. Returns how many were replaced. */
function stripImages(node: unknown): number {
  let n = 0;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const v = node[i];
      if (v && typeof v === "object" && (v as { type?: unknown }).type === "image") {
        node[i] = { type: "text", text: PLACEHOLDER_TEXT };
        n++;
      } else {
        n += stripImages(v);
      }
    }
  } else if (node && typeof node === "object") {
    for (const k of Object.keys(node as Record<string, unknown>)) {
      n += stripImages((node as Record<string, unknown>)[k]);
    }
  }
  return n;
}

/**
 * Pure: given one JSONL line, return the line with any image nodes replaced and the count stripped.
 * A malformed line is returned VERBATIM (never dropped) — a recovery must not corrupt the transcript.
 */
export function stripImagesFromLine(line: string): { line: string; stripped: number } {
  if (!line.trim()) return { line, stripped: 0 };
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return { line, stripped: 0 };
  }
  const stripped = stripImages(obj);
  return { line: stripped > 0 ? JSON.stringify(obj) : line, stripped };
}

/**
 * Rewrite a transcript file in place, replacing image payloads with placeholders. Backs up to
 * `<path>.bak` first (best-effort). Returns the number of images stripped; writes only if any were.
 * Never throws on a malformed line — those pass through unchanged.
 */
export async function stripTranscriptImages(path: string): Promise<number> {
  const content = await readFile(path, "utf8");
  await copyFile(path, `${path}.bak`).catch(() => undefined);
  // split/join round-trips the trailing newline (a trailing "\n" yields a final empty element that
  // join restores), so line boundaries are preserved exactly.
  let total = 0;
  const out = content.split("\n").map((l) => {
    const r = stripImagesFromLine(l);
    total += r.stripped;
    return r.line;
  });
  if (total > 0) await writeFile(path, out.join("\n"));
  return total;
}

/** Injected so the ladder is unit-testable without a live pod. */
export interface RecoveryDeps {
  /** Newest transcript .jsonl for the agent's cwd, or null if none. */
  findTranscript: () => Promise<string | null>;
  /** Restart the agent so it re-reads the (now trimmed) transcript — `podway-agent-restart`. */
  restartAgent: () => Promise<void>;
  /** Send `/compact` to the agent pane. */
  sendCompact: () => Promise<void>;
  /** Capture the agent pane text. */
  readPane: () => Promise<string>;
  log: (event: string, data?: Record<string, unknown>) => void;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export interface RecoveryState {
  lastRecoveryAt: number;
}

export type RecoveryOutcome = "cooldown" | "recovered" | "reset-fresh" | "no-transcript";

/**
 * Recover a context-overflowed session, ONCE. The caller gates entry on `atContextLimit` holding
 * across checks; this then runs the ladder that a human ran by hand on makore.app dev:
 *
 *   1. strip the un-compactable image blobs from the transcript (the actual bomb),
 *   2. restart the agent so it RE-READS the trimmed transcript (a running process still holds the old
 *      context in memory — a `/compact` on it cannot help until it reloads),
 *   3. with auto-compact now forced on, `--continue` compacts on load; if the pane still shows the
 *      limit, send an explicit `/compact`,
 *   4. if it STILL won't fit, the launcher's fresh-session fallback has taken over — report it so the
 *      owner gets a note that the conversation was reset.
 *
 * Rate-limited by `cooldownMs` so it can never loop.
 */
export async function recoverContextOverflow(
  deps: RecoveryDeps,
  state: RecoveryState,
  opts: { cooldownMs?: number; settleMs?: number } = {},
): Promise<RecoveryOutcome> {
  const cooldownMs = opts.cooldownMs ?? 5 * 60_000;
  const settleMs = opts.settleMs ?? 90_000;
  if (deps.now() - state.lastRecoveryAt < cooldownMs) return "cooldown";
  state.lastRecoveryAt = deps.now();

  const path = await deps.findTranscript();
  if (!path) {
    deps.log("agent_context_recover", { outcome: "no-transcript" });
    return "no-transcript";
  }
  const stripped = await stripTranscriptImages(path).catch(() => 0);
  deps.log("agent_context_recover_strip", { stripped });

  await deps.restartAgent();
  await deps.sleep(settleMs);
  if (!atContextLimit(await deps.readPane())) {
    deps.log("agent_context_recover", { outcome: "recovered", stripped, via: "restart" });
    return "recovered";
  }

  await deps.sendCompact();
  await deps.sleep(settleMs);
  if (!atContextLimit(await deps.readPane())) {
    deps.log("agent_context_recover", { outcome: "recovered", stripped, via: "compact" });
    return "recovered";
  }

  deps.log("agent_context_recover", { outcome: "reset-fresh", stripped });
  return "reset-fresh";
}
