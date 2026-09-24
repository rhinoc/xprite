import type { OnionSkinSettings } from "$/timeline/animation-options";
/** Timeline::getOnionskinFramesBounds clamps the range to real frame headers. */
export function onionSkinRangeGeometry(
  value: OnionSkinSettings,
  activeFrame: number,
  frameCount: number,
  frameWidth: number,
  scrollOffset = 0,
) {
  if (!value.active || frameCount < 1 || frameWidth <= 0) return null;
  const first = Math.max(0, activeFrame - value.previousFrames),
    last = Math.min(frameCount - 1, activeFrame + value.nextFrames);
  return {
    first,
    last,
    x: first * frameWidth - scrollOffset,
    width: (last - first + 1) * frameWidth,
    handleWidth: 6,
  };
}
/** Aseprite STATE_MOVING_ONIONSKIN_RANGE_LEFT/RIGHT use the original count and
 * hit-frame delta, preserving hidden extent when the painted range is clipped. */
export function dragOnionSkinRange(
  original: OnionSkinSettings,
  side: "previous" | "next",
  startFrame: number,
  currentFrame: number,
): OnionSkinSettings {
  const delta = currentFrame - startFrame;
  return {
    ...original,
    ...(side === "previous"
      ? { previousFrames: Math.max(0, original.previousFrames - delta) }
      : { nextFrames: Math.max(0, original.nextFrames + delta) }),
  };
}
