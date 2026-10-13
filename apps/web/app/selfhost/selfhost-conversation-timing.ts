/**
 * Timing model for the landing's example conversation (owner, 2026-10-08: one realistic scene per app,
 * shown one at a time, looping). Each scene: the visitor's message types, Claude "thinks", the reply
 * streams, then it HOLDS long enough to be read before the next scene fades in.
 *
 *   type     : YOU_MS_PER_CHAR   — brisk human typing, still readable as it appears
 *   think    : THINK_MS          — the only dead air in a scene
 *   stream   : ADMIN_MS_PER_CHAR — faster than reading, like Claude
 *   hold     : until a first-time reader has READ BOTH bubbles (model below), and ≥ MIN_HOLD_MS after the stream
 *   fade     : FADE_MS           — the scene fades out, then the next one starts
 *
 * Reading model (owner, 2026-10-12: "easy to read, and enough time to read them"). The reader is a
 * first-time visitor, maybe not a native speaker: ~15 chars/s (≈180 wpm, READ_MS_PER_CHAR), plus
 * ORIENT_MS to find each new bubble. They read your message as it types (typing is faster than reading,
 * so reading lags), then the reply from when it starts streaming or when they finish yours, whichever is
 * later. A scene may open with an `intro`: the agent's own first report (the app is live), which thinks,
 * streams and is READ before your message starts typing — the order a real new pod follows.
 */
export const YOU_MS_PER_CHAR = 35;
export const THINK_MS = 900;
export const ADMIN_MS_PER_CHAR = 15;
export const READ_MS_PER_CHAR = 65;
export const ORIENT_MS = 700;
export const MIN_HOLD_MS = 1800;
export const FADE_MS = 450;
/** The first scene waits this long after the page shows, so the visitor reads the hero (offer, h1, the
 * start of the subline) before motion pulls the eye away (owner, 2026-10-12). Only the first loop. */
export const START_DELAY_MS = 4000;

export interface SceneLengths {
  /** The agent's opening report (0 = none). */
  intro?: number;
  you: number;
  admin: number;
}

export interface SceneFrame {
  scene: number;
  introChars: number;
  youChars: number;
  adminChars: number;
  /** "intro" = the agent is about to report; "admin" = about to answer you; false = nobody thinking. */
  thinking: false | "intro" | "admin";
  /** The scene is fading out (next one starts after FADE_MS). */
  fading: boolean;
}

/** The scene's timeline (ms from its start). */
function phases(s: SceneLengths) {
  const intro = s.intro ?? 0;
  const introStream = intro ? THINK_MS : 0;
  const introEnd = introStream + intro * ADMIN_MS_PER_CHAR;
  // Your message starts only once a first-time reader has read the report.
  const youStart = intro ? Math.max(introEnd, introStream + ORIENT_MS + intro * READ_MS_PER_CHAR) : 0;
  const typeEnd = youStart + s.you * YOU_MS_PER_CHAR;
  const streamStart = typeEnd + THINK_MS;
  const streamEnd = streamStart + s.admin * ADMIN_MS_PER_CHAR;
  const youRead = s.you ? youStart + ORIENT_MS + s.you * READ_MS_PER_CHAR : youStart;
  const adminRead = Math.max(youRead, streamStart) + ORIENT_MS + s.admin * READ_MS_PER_CHAR;
  const end = Math.max(adminRead, streamEnd + MIN_HOLD_MS);
  return { intro, introStream, youStart, typeEnd, streamStart, end };
}

/** Duration of one scene, start to the end of its fade. */
export function sceneDurationMs(s: SceneLengths): number {
  return phases(s).end + FADE_MS;
}

/** What to show `elapsedMs` into the loop. Reduced motion: the first scene, complete and still. */
export function sceneFrameAt(elapsedMs: number, scenes: readonly SceneLengths[], reducedMotion = false): SceneFrame {
  const s0 = scenes[0]!;
  if (reducedMotion) return { scene: 0, introChars: s0.intro ?? 0, youChars: s0.you, adminChars: s0.admin, thinking: false, fading: false };
  // Before the start delay ends (the caller passes elapsed − START_DELAY_MS): the first scene, still empty.
  if (elapsedMs < 0) return { scene: 0, introChars: 0, youChars: 0, adminChars: 0, thinking: false, fading: false };
  const total = scenes.reduce((n, s) => n + sceneDurationMs(s), 0);
  let t = ((elapsedMs % total) + total) % total;
  let i = 0;
  while (t >= sceneDurationMs(scenes[i]!)) t -= sceneDurationMs(scenes[i++]!);
  const s = scenes[i]!;
  const p = phases(s);
  const clamp = (n: number, max: number) => Math.max(0, Math.min(max, Math.floor(n)));
  return {
    scene: i,
    introChars: clamp((t - p.introStream) / ADMIN_MS_PER_CHAR, p.intro),
    youChars: clamp((t - p.youStart) / YOU_MS_PER_CHAR, s.you),
    adminChars: clamp((t - p.streamStart) / ADMIN_MS_PER_CHAR, s.admin),
    thinking: p.intro && t < p.introStream ? "intro" : t >= p.typeEnd && t < p.streamStart ? "admin" : false,
    fading: t >= p.end,
  };
}
