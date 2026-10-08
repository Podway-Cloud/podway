/**
 * Timing model for the landing's example conversation (owner, 2026-10-08: one realistic scene per app,
 * shown one at a time, looping). Each scene: the visitor's message types, Claude "thinks", the reply
 * streams, then it HOLDS long enough to be read before the next scene fades in.
 *
 *   type     : YOU_MS_PER_CHAR   — brisk human typing, still readable as it appears
 *   think    : THINK_MS          — the only dead air in a scene
 *   stream   : ADMIN_MS_PER_CHAR — faster than reading, like Claude
 *   hold     : the reply is read at ~20 chars/s (≈240 wpm); what streaming did not cover is held, ≥ MIN_HOLD_MS
 *   fade     : FADE_MS           — the scene fades out, then the next one starts
 */
export const YOU_MS_PER_CHAR = 35;
export const THINK_MS = 900;
export const ADMIN_MS_PER_CHAR = 15;
export const READ_MS_PER_CHAR = 50;
export const MIN_HOLD_MS = 1800;
export const FADE_MS = 450;

export interface SceneLengths {
  you: number;
  admin: number;
}

export interface SceneFrame {
  scene: number;
  youChars: number;
  adminChars: number;
  thinking: boolean;
  /** The scene is fading out (next one starts after FADE_MS). */
  fading: boolean;
}

/** Duration of one scene, start to the end of its fade. */
export function sceneDurationMs(s: SceneLengths): number {
  const type = s.you * YOU_MS_PER_CHAR;
  const stream = s.admin * ADMIN_MS_PER_CHAR;
  const hold = Math.max(MIN_HOLD_MS, s.admin * READ_MS_PER_CHAR - stream);
  return type + THINK_MS + stream + hold + FADE_MS;
}

/** What to show `elapsedMs` into the loop. Reduced motion: the first scene, complete and still. */
export function sceneFrameAt(elapsedMs: number, scenes: readonly SceneLengths[], reducedMotion = false): SceneFrame {
  if (reducedMotion) return { scene: 0, youChars: scenes[0]!.you, adminChars: scenes[0]!.admin, thinking: false, fading: false };
  const total = scenes.reduce((n, s) => n + sceneDurationMs(s), 0);
  let t = ((elapsedMs % total) + total) % total;
  let i = 0;
  while (t >= sceneDurationMs(scenes[i]!)) t -= sceneDurationMs(scenes[i++]!);
  const s = scenes[i]!;
  const typeEnd = s.you * YOU_MS_PER_CHAR;
  const streamStart = typeEnd + THINK_MS;
  return {
    scene: i,
    youChars: Math.min(s.you, Math.floor(t / YOU_MS_PER_CHAR)),
    adminChars: Math.max(0, Math.min(s.admin, Math.floor((t - streamStart) / ADMIN_MS_PER_CHAR))),
    thinking: t >= typeEnd && t < streamStart,
    fading: t >= sceneDurationMs(s) - FADE_MS,
  };
}
