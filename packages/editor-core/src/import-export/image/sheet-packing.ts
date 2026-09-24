import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import type { Rect } from "$/base/primitives";

/** Port of LAF gfx::PackingRects (MIT): stable area order, top-left first-fit
 * region subtraction, conditional spacing at the final right/bottom edge.
 * Jumping over intersecting occupied regions preserves its integer scan order. */
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
  const attempt = (width: number, height: number): Rect[] | null => {
    const w = width - border * 2,
      h = height - border * 2,
      occupied: Rect[] = [],
      result: Rect[] = [];
    for (const size of order) {
      let placed = false;
      for (let y = 0; y <= h - size.height && !placed; y++)
        for (let x = 0; x <= w - size.width;) {
          const cw = size.width + (x === w - size.width ? 0 : spacing),
            ch = size.height + (y === h - size.height ? 0 : spacing);
          if (x + cw > w || y + ch > h) {
            x++;
            continue;
          }
          let jump = x;
          for (const r of occupied)
            if (x < r.x + r.width && x + cw > r.x && y < r.y + r.height && y + ch > r.y)
              jump = Math.max(jump, r.x + r.width);
          if (jump > x) {
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
      if (!placed) return null;
    }
    return result;
  };
  if (fixedWidth && fixedHeight) {
    const rects = attempt(fixedWidth, fixedHeight);
    if (!rects) throw new Error("The frames do not fit within the sheet constraints.");
    return { width: fixedWidth, height: fixedHeight, rects };
  }
  const w0 = Math.max(fixedWidth, ...sizes.map((s) => s.width), 1),
    h0 = Math.max(fixedHeight, ...sizes.map((s) => s.height), 1),
    needed = sizes.reduce((n, s) => n + s.width * s.height, 0);
  let width = w0,
    height = h0,
    step = 0;
  while (
    width + border * 2 <= MAX_IMAGE_DIMENSION &&
    height + border * 2 <= MAX_IMAGE_DIMENSION &&
    (width + border * 2) * (height + border * 2) <= MAX_IMAGE_PIXELS
  ) {
    if (width * height >= needed) {
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
