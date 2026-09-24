import { UINT16_VALUE_COUNT } from "$/base/numeric-constants";

/** Total complete plays, including the first. Zero means unlimited playback. */
export const MAX_ANIMATION_LOOP_COUNT = UINT16_VALUE_COUNT;

export function assertAnimationLoopCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_ANIMATION_LOOP_COUNT)
    throw new RangeError(`Animation play count must be between 0 and ${MAX_ANIMATION_LOOP_COUNT}`);
  return value;
}

/** Explicit export play counts override the source policy. */
export function animationExportLoopCount(
  sourceCount: number | undefined,
  options: { loopCount?: number },
): number {
  return assertAnimationLoopCount(options.loopCount ?? sourceCount ?? 0);
}
