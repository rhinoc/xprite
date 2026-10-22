/** Points and rectangles in export units, and whole-block picture placement. */
export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Whole-block placement of a pixelated picture: `cell` export units per block. */
export interface Placement {
  x: number;
  y: number;
  cell: number;
  columns: number;
  rows: number;
}

export function placementRect(placement: Placement): Rect {
  return {
    x: placement.x,
    y: placement.y,
    width: placement.columns * placement.cell,
    height: placement.rows * placement.cell,
  };
}

export function intersectRects(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}
