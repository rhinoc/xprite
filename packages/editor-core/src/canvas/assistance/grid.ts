import type { Point, Rect } from "$/base/primitives";
export enum GridSnapPreference {
  Closest = "closest",
  BoxOrigin = "box-origin",
  Floor = "floor",
  Ceil = "ceil",
  BoxEnd = "box-end",
}
/** .refs/libresprite/src/app/snap_to_grid.cpp integer semantics. Negative division
 * truncates toward zero; nearest ties do not round upward. */
export function snapPointToGrid(
  grid: Rect,
  point: Point,
  prefer: GridSnapPreference = GridSnapPreference.Closest,
): Point {
  if (grid.width <= 0 || grid.height <= 0) return { ...point };
  const axis = (position: number, origin: number, size: number) => {
    size = Math.trunc(size);
    origin = Math.trunc(origin);
    position = Math.trunc(position);
    const rem = origin % size;
    let n = position - rem;
    if (prefer !== GridSnapPreference.Closest && n < 0) n -= size;
    const quotient = Math.trunc(n / size),
      rest = n % size;
    switch (prefer) {
      case GridSnapPreference.Closest:
        return rem + quotient * size + (rest > Math.trunc(size / 2) ? size : 0);
      case GridSnapPreference.BoxOrigin:
      case GridSnapPreference.Floor:
        return rem + quotient * size;
      case GridSnapPreference.Ceil:
        return rest ? rem + (quotient + 1) * size : n;
      case GridSnapPreference.BoxEnd:
        return rem + (quotient + 1) * size;
    }
  };
  return { x: axis(point.x, grid.x, grid.width) || 0, y: axis(point.y, grid.y, grid.height) || 0 };
}
/** Snap in brush-local coordinates, then translate back to the document.
 * One-point tools do not use this brush placement grid. */
export function snapStrokePoint(
  point: Point,
  grid: Rect,
  brushCenter: Point = { x: 0, y: 0 },
  enabled = true,
): Point {
  if (!enabled) return { ...point };
  const p = snapPointToGrid(grid, { x: point.x - brushCenter.x, y: point.y - brushCenter.y });
  return { x: p.x + brushCenter.x, y: p.y + brushCenter.y };
}
export function canToolSnapToGrid(tool: string): boolean {
  return !["bucket", "magic_wand", "eyedropper", "zoom", "text"].includes(tool);
}
export function normalizedGridBounds(bounds: Rect): Rect {
  return {
    x: Math.trunc(bounds.x),
    y: Math.trunc(bounds.y),
    width: Math.max(1, Math.trunc(bounds.width)),
    height: Math.max(1, Math.trunc(bounds.height)),
  };
}
/** Grid origin is a modulo offset into the grid lattice, not the sprite origin. */
export function offsetGridLines(bounds: Rect, origin: Point, zoom: number, grid: Rect): Rect[] {
  const lines: Rect[] = [],
    stepX = Math.max(1, Math.trunc(grid.width)) * zoom,
    stepY = Math.max(1, Math.trunc(grid.height)) * zoom;
  const x = origin.x + (((grid.x % grid.width) + grid.width) % grid.width) * zoom,
    y = origin.y + (((grid.y % grid.height) + grid.height) % grid.height) * zoom;
  for (let yy = Math.trunc(y); yy <= bounds.y + bounds.height; yy += stepY)
    lines.push({ x: bounds.x, y: Math.trunc(yy), width: bounds.width, height: 1 });
  for (let xx = Math.trunc(x); xx <= bounds.x + bounds.width; xx += stepX)
    lines.push({ x: Math.trunc(xx), y: bounds.y, width: 1, height: bounds.height });
  return lines;
}
