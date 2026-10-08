import { describe, expect, it } from "vitest";
import {
  sceneFrameAt, sceneDurationMs, YOU_MS_PER_CHAR, THINK_MS, ADMIN_MS_PER_CHAR, MIN_HOLD_MS, FADE_MS, READ_MS_PER_CHAR,
} from "../app/selfhost/selfhost-conversation-timing";

const scenes = [{ you: 20, admin: 100 }, { you: 10, admin: 20 }];

describe("landing example conversation: one scene at a time, looping", () => {
  it("types, thinks, streams, holds, fades — in that order", () => {
    const typeEnd = 20 * YOU_MS_PER_CHAR;
    expect(sceneFrameAt(typeEnd / 2, scenes)).toMatchObject({ scene: 0, youChars: 10, adminChars: 0, thinking: false });
    expect(sceneFrameAt(typeEnd + 10, scenes)).toMatchObject({ scene: 0, youChars: 20, adminChars: 0, thinking: true });
    const streamStart = typeEnd + THINK_MS;
    expect(sceneFrameAt(streamStart + 50 * ADMIN_MS_PER_CHAR, scenes)).toMatchObject({ adminChars: 50, thinking: false });
    expect(sceneFrameAt(sceneDurationMs(scenes[0]!) - FADE_MS - 1, scenes)).toMatchObject({ scene: 0, adminChars: 100, fading: false });
    expect(sceneFrameAt(sceneDurationMs(scenes[0]!) - 1, scenes)).toMatchObject({ scene: 0, fading: true });
    expect(sceneFrameAt(sceneDurationMs(scenes[0]!), scenes)).toMatchObject({ scene: 1, youChars: 0 });
  });

  it("a reply stays up long enough to read (~20 chars/s), never less than the minimum", () => {
    const long = { you: 10, admin: 140 };
    const shown = sceneDurationMs(long) - long.you * YOU_MS_PER_CHAR - THINK_MS - FADE_MS; // stream + hold
    expect(shown).toBeGreaterThanOrEqual(140 * READ_MS_PER_CHAR);
    const short = { you: 10, admin: 10 };
    expect(sceneDurationMs(short) - 10 * YOU_MS_PER_CHAR - THINK_MS - 10 * ADMIN_MS_PER_CHAR - FADE_MS).toBe(MIN_HOLD_MS);
  });

  it("loops back to the first scene", () => {
    const total = sceneDurationMs(scenes[0]!) + sceneDurationMs(scenes[1]!);
    expect(sceneFrameAt(total + 5, scenes)).toMatchObject({ scene: 0 });
  });

  it("reduced motion: the first scene, complete and still", () => {
    expect(sceneFrameAt(0, scenes, true)).toEqual({ scene: 0, youChars: 20, adminChars: 100, thinking: false, fading: false });
  });
});
