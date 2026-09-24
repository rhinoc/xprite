export const asepriteZoomLevels = [
  100 / 64,
  100 / 48,
  100 / 32,
  100 / 24,
  100 / 16,
  100 / 12,
  12.5,
  100 / 6,
  20,
  25,
  100 / 3,
  50,
  100,
  200,
  300,
  400,
  500,
  600,
  800,
  1200,
  1600,
  2400,
  3200,
  4800,
  6400,
] as const;
export function stepAsepriteZoom(value: number, steps: number): number {
  let closest = 0;
  for (let index = 1; index < asepriteZoomLevels.length; index++) {
    if (Math.abs(value - asepriteZoomLevels[index]) < Math.abs(value - asepriteZoomLevels[closest]))
      closest = index;
  }
  return asepriteZoomLevels[
    Math.max(0, Math.min(asepriteZoomLevels.length - 1, closest + Math.trunc(steps)))
  ];
}

/** LibreSprite's wheel zoom threshold adapted to normalized browser deltas. */
export function libreSpriteWheelZoomSteps(delta: number, precise: boolean): number {
  const steps = Math.trunc(precise ? Math.max(-1, Math.min(1, delta / 1.5)) : delta);
  return steps ? -steps : 0;
}
export function timelineWheelFrameIndex(
  current: number,
  count: number,
  delta: number,
  precise: boolean,
): number {
  if (count <= 0) return 0;
  const steps = precise ? Math.sign(delta) : Math.trunc(delta);
  return (((current - steps) % count) + count) % count;
}
/** LibreSprite's discrete wheel scroll scaling adapted to browser viewports. */
export function libreSpriteWheelScrollDelta(
  action: "horizontal" | "vertical",
  x: number,
  y: number,
  viewport: { width: number; height: number },
  precise: boolean,
): { x: number; y: number } {
  if (precise) return { x, y };
  const dz = x + y;
  return action === "horizontal"
    ? { x: Math.trunc(Math.trunc(dz * viewport.width) / 10), y: 0 }
    : { x: 0, y: Math.trunc(Math.trunc(dz * viewport.height) / 10) };
}
