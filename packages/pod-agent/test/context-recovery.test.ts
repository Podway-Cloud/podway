import { describe, it, expect } from "vitest";
import { stripImagesFromLine } from "../src/context-recovery.js";

describe("stripImagesFromLine", () => {
  it("replaces a base64 image tool-result with a text placeholder, keeping the structure", () => {
    const line = JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [
          {
            tool_use_id: "toolu_1",
            type: "tool_result",
            content: [{ type: "image", source: { type: "base64", data: "iVBORw0KGgo…" } }],
          },
        ],
      },
    });
    const { line: out, stripped } = stripImagesFromLine(line);
    expect(stripped).toBe(1);
    const o = JSON.parse(out);
    const item = o.message.content[0].content[0];
    expect(item.type).toBe("text");
    expect(item.text).toMatch(/screenshot removed/i);
    // the surrounding tool_result envelope is intact
    expect(o.message.content[0].type).toBe("tool_result");
    expect(o.message.content[0].tool_use_id).toBe("toolu_1");
  });

  it("counts multiple images on one line", () => {
    const line = JSON.stringify({
      content: [
        { type: "image", source: { data: "a" } },
        { type: "text", text: "keep me" },
        { type: "image", source: { data: "b" } },
      ],
    });
    const { line: out, stripped } = stripImagesFromLine(line);
    expect(stripped).toBe(2);
    const o = JSON.parse(out);
    expect(o.content[1].text).toBe("keep me"); // text is left alone
    expect(o.content[0].type).toBe("text");
    expect(o.content[2].type).toBe("text");
  });

  it("leaves an image-free line untouched (byte-identical)", () => {
    const line = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "hi" }] } });
    const { line: out, stripped } = stripImagesFromLine(line);
    expect(stripped).toBe(0);
    expect(out).toBe(line);
  });

  it("returns a malformed line VERBATIM, never dropping it", () => {
    const line = "{not valid json";
    const { line: out, stripped } = stripImagesFromLine(line);
    expect(stripped).toBe(0);
    expect(out).toBe(line);
  });

  it("handles an empty line", () => {
    expect(stripImagesFromLine("")).toEqual({ line: "", stripped: 0 });
  });
});

import { recoverContextOverflow, type RecoveryDeps, type RecoveryState } from "../src/context-recovery.js";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeDeps(over: Partial<RecoveryDeps> & { panes?: string[] }): RecoveryDeps & { calls: string[] } {
  const calls: string[] = [];
  const panes = over.panes ?? ["❯ "]; // default: recovered
  let i = 0;
  const dir = mkdtempSync(join(tmpdir(), "ctx-"));
  const tpath = join(dir, "s.jsonl");
  writeFileSync(tpath, JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "hi" }] } }) + "\n");
  return {
    calls,
    findTranscript: over.findTranscript ?? (async () => tpath),
    restartAgent: async () => { calls.push("restart"); },
    sendCompact: async () => { calls.push("compact"); },
    readPane: async () => panes[Math.min(i++, panes.length - 1)],
    log: (e) => calls.push(`log:${e}`),
    now: () => 1_000_000,
    sleep: async () => {},
  };
}

describe("recoverContextOverflow — the recovery ladder", () => {
  it("skips inside the cooldown window (never loops)", async () => {
    const deps = makeDeps({});
    const state: RecoveryState = { lastRecoveryAt: 1_000_000 - 1000 }; // 1s ago, < cooldown
    expect(await recoverContextOverflow(deps, state)).toBe("cooldown");
    expect(deps.calls).not.toContain("restart");
  });

  it("reports no-transcript when none is found", async () => {
    const deps = makeDeps({ findTranscript: async () => null });
    const state: RecoveryState = { lastRecoveryAt: 0 };
    expect(await recoverContextOverflow(deps, state)).toBe("no-transcript");
    expect(deps.calls).not.toContain("restart");
  });

  it("recovers via restart alone when the pane clears after reload", async () => {
    const deps = makeDeps({ panes: ["❯ ready"] }); // clear after restart
    const state: RecoveryState = { lastRecoveryAt: 0 };
    expect(await recoverContextOverflow(deps, state)).toBe("recovered");
    expect(deps.calls).toContain("restart");
    expect(deps.calls).not.toContain("compact");
  });

  it("falls back to /compact when restart alone doesn't clear it", async () => {
    const deps = makeDeps({ panes: ["Context limit reached", "❯ ready"] }); // stuck after restart, clear after compact
    const state: RecoveryState = { lastRecoveryAt: 0 };
    expect(await recoverContextOverflow(deps, state)).toBe("recovered");
    expect(deps.calls).toContain("compact");
  });

  it("reports reset-fresh when it still won't fit", async () => {
    const deps = makeDeps({ panes: ["Context limit reached", "Context limit reached"] });
    const state: RecoveryState = { lastRecoveryAt: 0 };
    expect(await recoverContextOverflow(deps, state)).toBe("reset-fresh");
  });
});
