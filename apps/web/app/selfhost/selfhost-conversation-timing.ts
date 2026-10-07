export const MESSAGE_TIMING = [
  { startsAt: 0, msPerChar: 50 },
  { startsAt: 1300, msPerChar: 16 },
  { startsAt: 3800, msPerChar: 50 },
  { startsAt: 5400, msPerChar: 16 },
] as const;

export function conversationFrameAt(
  elapsedMs: number,
  messageLengths: readonly number[],
  reducedMotion = false,
): { chars: number[]; thinking: number | null } {
  if (reducedMotion) return { chars: [...messageLengths], thinking: null };

  const chars = messageLengths.map((length, index) => {
    const timing = MESSAGE_TIMING[index];
    if (!timing) return length;
    return Math.min(length, Math.max(0, Math.floor((elapsedMs - timing.startsAt) / timing.msPerChar)));
  });
  const thinking = [1, 3].find((index) => {
    const startsAt = MESSAGE_TIMING[index].startsAt;
    const previous = MESSAGE_TIMING[index - 1];
    const previousFinish = previous.startsAt + messageLengths[index - 1] * previous.msPerChar;
    return elapsedMs >= Math.max(startsAt - 350, previousFinish) && elapsedMs < startsAt;
  }) ?? null;
  return { chars, thinking };
}
