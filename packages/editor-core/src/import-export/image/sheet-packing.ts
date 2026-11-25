import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import type { Rect } from "$/base/primitives";

/** Port of LAF gfx::PackingRects (MIT): stable area order, top-left first-fit
 * region subtraction, conditional spacing at the final right/bottom edge.
 * Jumping over intersecting occupied regions in both X and Y preserves its exact scan order. */
export function packAsepriteSheetRects(
  sizes: readonly Pick<Rect, "width" | "height">[],
  border: number,
  spacing: number,
  fixedWidth = 0,
  fixedHeight = 0,
): { width: number; height: number; rects: Rect[] } {
  const order = sizes
    .map((size, index) => ({ ...size, index }))
    .sort((a, b) => b.width * b.height - a.width * a.height);
  let maxRectWidth = 0;
  let maxRectHeight = 0;
  let needed = 0;
  let neededWithSpacing = 0;
  for (let index = 0; index < sizes.length; index++) {
    const size = sizes[index];
    if (size.width > maxRectWidth) maxRectWidth = size.width;
    if (size.height > maxRectHeight) maxRectHeight = size.height;
    needed += size.width * size.height;
    neededWithSpacing += (size.width + spacing) * (size.height + spacing);
  }
  const rowOccupied: Rect[] = [];
  const attempt = (width: number, height: number): Rect[] | null => {
    const w = width - border * 2;
    const h = height - border * 2;
    if (
      order.length > 0 &&
      (w < maxRectWidth ||
        h < maxRectHeight ||
        w * h < needed ||
        (w + spacing) * (h + spacing) < neededWithSpacing)
    ) {
      return null;
    }
    const occupied: Rect[] = [];
    const result: Rect[] = [];
    for (let orderIndex = 0; orderIndex < order.length; orderIndex++) {
      const size = order[orderIndex];
      const maxX = w - size.width;
      const maxY = h - size.height;
      let placed = false;
      for (let y = 0; y <= maxY;) {
        const ch = size.height + (y === maxY ? 0 : spacing);
        if (y + ch > h) {
          y = maxY;
          continue;
        }
        let rowOccupiedCount = 0;
        const rowBottom = y + ch;
        for (let occIndex = 0; occIndex < occupied.length; occIndex++) {
          const r = occupied[occIndex];
          if (y < r.y + r.height && rowBottom > r.y) {
            rowOccupied[rowOccupiedCount++] = r;
          }
        }
        let nextY = h + 1;
        for (let x = 0; x <= maxX;) {
          const cw = size.width + (x === maxX ? 0 : spacing);
          if (x + cw > w) {
            x = maxX;
            continue;
          }
          let jump = x;
          let jumpEndY = 0;
          const xRight = x + cw;
          for (let index = 0; index < rowOccupiedCount; index++) {
            const r = rowOccupied[index];
            const right = r.x + r.width;
            if (x < right && xRight > r.x) {
              const bottom = r.y + r.height;
              if (right > jump || (right === jump && bottom > jumpEndY)) {
                jump = right;
                jumpEndY = bottom;
              }
            }
          }
          if (jump > x) {
            if (jumpEndY < nextY) nextY = jumpEndY;
            x = jump;
            continue;
          }
          occupied.push({ x, y, width: cw, height: ch });
          result[size.index] = {
            x: x + border,
            y: y + border,
            width: size.width,
            height: size.height,
          };
          placed = true;
          break;
        }
        if (placed) break;
        y = nextY > y ? nextY : y + 1;
      }
      if (!placed) return null;
    }
    return result;
  };
  if (fixedWidth && fixedHeight) {
    const rects = attempt(fixedWidth, fixedHeight);
    if (!rects) throw new Error("The frames do not fit within the sheet constraints.");
    return { width: fixedWidth, height: fixedHeight, rects };
  }
  const w0 = Math.max(fixedWidth, maxRectWidth, 1);
  const h0 = Math.max(fixedHeight, maxRectHeight, 1);
  let width = w0;
  let height = h0;
  let step = 0;
  while (
    width + border * 2 <= MAX_IMAGE_DIMENSION &&
    height + border * 2 <= MAX_IMAGE_DIMENSION &&
    (width + border * 2) * (height + border * 2) <= MAX_IMAGE_PIXELS
  ) {
    if (width * height >= needed && (width + spacing) * (height + spacing) >= neededWithSpacing) {
      const rects = attempt(width + border * 2, height + border * 2);
      if (rects) return { width: width + border * 2, height: height + border * 2, rects };
    }
    if (!fixedWidth && !fixedHeight) {
      if (++step % 2) width += w0;
      else height += h0;
    } else if (!fixedWidth) width += w0;
    else height += h0;
  }
  throw new RangeError("Packed sheet exceeds the image limit.");
}
