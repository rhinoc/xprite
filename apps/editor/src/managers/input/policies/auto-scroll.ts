import type { Point } from "@xprite/editor-core";

/** Continue a drag beyond the canvas edge by scrolling with outward pointer
 * motion. Raster input remains clamped to the visible canvas. */
export function canvasAutoScroll(
  previous: Point,
  current: Point,
  pan: Point,
  viewport: { width: number; height: number },
) {
  const dx = current.x - previous.x,
    dy = current.y - previous.y;
  const x = (current.x < 0 && dx < 0) || (current.x >= viewport.width && dx > 0) ? dx : 0;
  const y = (current.y < 0 && dy < 0) || (current.y >= viewport.height && dy > 0) ? dy : 0;
  return {
    pan: { x: pan.x - x, y: pan.y - y },
    point: {
      x: Math.max(0, Math.min(viewport.width - 1, current.x)),
      y: Math.max(0, Math.min(viewport.height - 1, current.y)),
    },
  };
}
