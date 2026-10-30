export const SPLIT_MIN = 0;
export const SPLIT_MAX = 100;
const SPLIT_STEP = 5;
export const SPLIT_START = 50;

export const clampSplit = (value: number) =>
  Number.isFinite(value) ? Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, value)) : SPLIT_START;

/** Divider position, in percent of the preview width, under a pointer at `clientX`. */
export function splitFromPointer(clientX: number, rect: { left: number; width: number }) {
  return rect.width > 0 ? clampSplit(((clientX - rect.left) / rect.width) * SPLIT_MAX) : null;
}

/** The divider position after a key press, or null when the key does not move it. */
export function splitFromKey(split: number, key: string, large = false) {
  const step = large ? SPLIT_STEP * 2 : SPLIT_STEP;
  switch (key) {
    case "ArrowLeft":
      return clampSplit(split - step);
    case "ArrowRight":
      return clampSplit(split + step);
    case "Home":
      return SPLIT_MIN;
    case "End":
      return SPLIT_MAX;
    default:
      return null;
  }
}

/**
 * How far the result layer is cut from its own left edge: everything left of the divider shows the
 * original, so the result begins at the divider (never past either edge of the layer).
 */
export function resultClipLeft(
  split: number,
  stageWidth: number,
  layer: { left: number; width: number },
) {
  const divider = (clampSplit(split) / SPLIT_MAX) * stageWidth;
  return Math.max(0, Math.min(layer.width, divider - layer.left));
}

/**
 * How far the original layer is cut from its own right edge: everything right of the divider shows
 * the result alone (over the stage checker), so soft original fringe cannot leak through transparent
 * result cells.
 */
export function originalClipRight(
  split: number,
  stageWidth: number,
  layer: { left: number; width: number },
) {
  const divider = (clampSplit(split) / SPLIT_MAX) * stageWidth;
  return Math.max(0, Math.min(layer.width, layer.left + layer.width - divider));
}
