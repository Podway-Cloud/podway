import { describe, expect, it } from "vitest";
import {
  sceneFrameAt, sceneDurationMs, YOU_MS_PER_CHAR, THINK_MS, ADMIN_MS_PER_CHAR, MIN_HOLD_MS, FADE_MS, READ_MS_PER_CHAR, ORIENT_MS,
} from "../app/selfhost/selfhost-conversation-timing";

const scenes = [{ you: 20, admin: 100 }, { you: 10, admin: 20 }];

describe("landing example conversation: one scene at a time, looping", () => {
  it("types, thinks, streams, holds, fades — in that order", () => {
    const typeEnd = 20 * YOU_MS_PER_CHAR;
    expect(sceneFrameAt(typeEnd / 2, scenes)).toMatchObject({ scene: 0, youChars: 10, adminChars: 0, thinking: false });
    expect(sceneFrameAt(typeEnd + 10, scenes)).toMatchObject({ scene: 0, youChars: 20, adminChars: 0, thinking: "admin" });
    const streamStart = typeEnd + THINK_MS;
    expect(sceneFrameAt(streamStart + 50 * ADMIN_MS_PER_CHAR, scenes)).toMatchObject({ adminChars: 50, thinking: false });
    expect(sceneFrameAt(sceneDurationMs(scenes[0]!) - FADE_MS - 1, scenes)).toMatchObject({ scene: 0, adminChars: 100, fading: false });
    expect(sceneFrameAt(sceneDurationMs(scenes[0]!) - 1, scenes)).toMatchObject({ scene: 0, fading: true });
    expect(sceneFrameAt(sceneDurationMs(scenes[0]!), scenes)).toMatchObject({ scene: 1, youChars: 0 });
  });

  it("a scene stays up until a first-time reader has read BOTH bubbles (~15 chars/s + finding each)", () => {
    for (const sc of [{ you: 65, admin: 90 }, { you: 30, admin: 140 }, { you: 0, admin: 135 }]) {
      const visible = sceneDurationMs(sc) - FADE_MS;
      const bubbles = sc.you ? 2 : 1;
      expect(visible).toBeGreaterThanOrEqual(bubbles * ORIENT_MS + (sc.you + sc.admin) * READ_MS_PER_CHAR);
    }
    expect(READ_MS_PER_CHAR).toBeGreaterThanOrEqual(60); // ≤ ~16 chars/s: unfamiliar text, maybe not in their first language
  });

  it("a short reply still holds at least the minimum after it finishes streaming", () => {
    const short = { you: 2, admin: 2 };
    expect(sceneDurationMs(short) - FADE_MS).toBeGreaterThanOrEqual(2 * YOU_MS_PER_CHAR + THINK_MS + 2 * ADMIN_MS_PER_CHAR + MIN_HOLD_MS);
  });

  it("the agent can speak first (no 'you' line): it thinks, then streams", () => {
    const first = [{ you: 0, admin: 40 }];
    expect(sceneFrameAt(10, first)).toMatchObject({ youChars: 0, thinking: "admin" });
    expect(sceneFrameAt(THINK_MS + 20 * ADMIN_MS_PER_CHAR, first)).toMatchObject({ adminChars: 20, thinking: false });
  });

  it("before the start delay: the first scene, empty and still (the visitor reads the hero first)", () => {
    expect(sceneFrameAt(-1, scenes)).toEqual({ scene: 0, introChars: 0, youChars: 0, adminChars: 0, thinking: false, fading: false });
  });

  it("a scene can open with the agent's own report: it thinks, streams, and is READ before you start typing", () => {
    const sc = [{ intro: 80, you: 40, admin: 90 }];
    expect(sceneFrameAt(10, sc)).toMatchObject({ thinking: "intro", introChars: 0, youChars: 0 });
    expect(sceneFrameAt(THINK_MS + 20 * ADMIN_MS_PER_CHAR, sc)).toMatchObject({ introChars: 20, youChars: 0, thinking: false });
    // Your message waits until a reader has had ORIENT + 80 chars of reading time on the report.
    const youStart = THINK_MS + ORIENT_MS + 80 * READ_MS_PER_CHAR;
    expect(sceneFrameAt(youStart - 5, sc).youChars).toBe(0);
    expect(sceneFrameAt(youStart + 10 * YOU_MS_PER_CHAR, sc)).toMatchObject({ introChars: 80, youChars: 10 });
    // …and the whole scene stays up until all three bubbles have been read.
    expect(sceneDurationMs(sc[0]!) - FADE_MS).toBeGreaterThanOrEqual(THINK_MS + 3 * ORIENT_MS + (80 + 40 + 90) * READ_MS_PER_CHAR);
  });

  it("loops back to the first scene", () => {
    const total = sceneDurationMs(scenes[0]!) + sceneDurationMs(scenes[1]!);
    expect(sceneFrameAt(total + 5, scenes)).toMatchObject({ scene: 0 });
  });

  it("reduced motion: the first scene, complete and still", () => {
    expect(sceneFrameAt(0, scenes, true)).toEqual({ scene: 0, introChars: 0, youChars: 20, adminChars: 100, thinking: false, fading: false });
  });
});
