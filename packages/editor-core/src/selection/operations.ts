import type { PointerInput } from "$/base/pointer-input";
import type { PixelBuffer, PixelMask, Point, Rgba } from "$/base/primitives";
import { assertDimension, assertPixelCount } from "$/document/pixel-validation";
/** Aseprite masks are IMAGE_BITMAP booleans (0/1), never alpha coverage.
 * Readers deliberately accept any existing nonzero value from clipboard/transform masks.
 * Selection algorithms follow the MIT-licensed doc/mask.cpp,
 * algorithm/floodfill.cpp and algorithm/modify_selection.cpp. */
import type { EditorDocument } from "$/document/types";
import { SelectionMode, SelectionModifier } from "$/selection/types";
export type SelectionModeInput = SelectionMode | `${SelectionMode}`;
import { UINT8_MAX } from "$/base/numeric-constants";

export function canMoveSelectionPixels(
  mode: SelectionModeInput,
  moveOnAddMode = true,
  copy = false,
): boolean {
  return copy || mode === SelectionMode.Replace || (mode === SelectionMode.Add && moveOnAddMode);
}

/** Product selection shortcut priority: subtract, then intersect, then add.
 * A secondary button on a selection tool also subtracts. */
export function selectionModeForInput(
  mode: SelectionModeInput,
  input: Pick<PointerInput, "shift" | "alt" | "ctrl" | "button" | "actionModifiers">,
): SelectionMode {
  if (
    input.button === 2 ||
    (input.actionModifiers?.subtractSelection ?? (input.shift && input.alt))
  )
    return SelectionMode.Subtract;
  if (input.actionModifiers?.intersectSelection ?? (input.shift && input.ctrl))
    return SelectionMode.Intersect;
  if (input.actionModifiers?.addSelection ?? input.shift) return SelectionMode.Add;
  switch (mode) {
    case SelectionMode.Add:
      return SelectionMode.Add;
    case SelectionMode.Subtract:
      return SelectionMode.Subtract;
    case SelectionMode.Intersect:
      return SelectionMode.Intersect;
    default:
      return SelectionMode.Replace;
  }
}
export function selectionContains(mask: PixelMask | null, x: number, y: number): boolean {
  return (
    !!mask &&
    x >= mask.x &&
    y >= mask.y &&
    x < mask.x + mask.width &&
    y < mask.y + mask.height &&
    !!mask.data[(y - mask.y) * mask.width + x - mask.x]
  );
}

/** Invert a mask within the document bounds, including irregular masks. */
export function invertedSelection(
  width: number,
  height: number,
  previous: PixelMask | null,
): PixelMask | null {
  const data = new Uint8Array(width * height);
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const selected =
        previous &&
        x >= previous.x &&
        y >= previous.y &&
        x < previous.x + previous.width &&
        y < previous.y + previous.height &&
        previous.data[(y - previous.y) * previous.width + x - previous.x];
      if (selected) continue;
      data[y * width + x] = UINT8_MAX;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  if (right < left) return null;
  const maskWidth = right - left + 1,
    maskHeight = bottom - top + 1,
    trimmed = new Uint8Array(maskWidth * maskHeight);
  for (let y = 0; y < maskHeight; y++)
    trimmed.set(
      data.subarray((top + y) * width + left, (top + y) * width + left + maskWidth),
      y * maskWidth,
    );
  return { x: left, y: top, width: maskWidth, height: maskHeight, data: trimmed };
}

export function compactSelection(mask: PixelMask): PixelMask | null {
  let x0 = mask.width,
    y0 = mask.height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < mask.height; y++) {
    const row = y * mask.width;
    let first = 0,
      last = mask.width - 1;
    while (first < mask.width && !mask.data[row + first]) first++;
    if (first === mask.width) continue;
    while (last > first && !mask.data[row + last]) last--;
    x0 = Math.min(x0, first);
    x1 = Math.max(x1, last);
    if (y0 === mask.height) y0 = y;
    y1 = y;
  }
  if (x1 < 0) return null;
  const width = x1 - x0 + 1,
    height = y1 - y0 + 1,
    data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      data[y * width + x] = mask.data[(y + y0) * mask.width + x + x0] ? 1 : 0;
  return { x: mask.x + x0, y: mask.y + y0, width, height, data };
}
export function combineSelection(
  base: PixelMask | null,
  incoming: PixelMask | null,
  mode: SelectionMode,
  width: number,
  height: number,
): PixelMask | null {
  // Aseprite selection ink clips new gesture points to the sprite, but existing
  // color-range/moved mask pixels outside the sprite survive add/subtract.
  let clipped: PixelMask | null = null;
  if (incoming) {
    const left = Math.max(0, incoming.x),
      top = Math.max(0, incoming.y),
      right = Math.min(width, incoming.x + incoming.width),
      bottom = Math.min(height, incoming.y + incoming.height);
    if (right > left && bottom > top) {
      const w = right - left,
        h = bottom - top,
        data = new Uint8Array(w * h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          data[y * w + x] = selectionContains(incoming, left + x, top + y) ? 1 : 0;
      clipped = compactSelection({ x: left, y: top, width: w, height: h, data });
    }
  }
  if (!base && (mode === SelectionMode.Subtract || mode === SelectionMode.Intersect)) return null;
  if (!base || mode === SelectionMode.Replace) return clipped;
  return combineColorRangeSelection(base, clipped, mode);
}
export function rectangleSelection(
  a: Point,
  b: Point,
  width: number,
  height: number,
): PixelMask | null {
  const x = Math.max(0, Math.min(Math.floor(a.x), Math.floor(b.x))),
    y = Math.max(0, Math.min(Math.floor(a.y), Math.floor(b.y)));
  const w = Math.max(0, Math.min(width, Math.max(Math.floor(a.x), Math.floor(b.x)) + 1) - x),
    h = Math.max(0, Math.min(height, Math.max(Math.floor(a.y), Math.floor(b.y)) + 1) - y);
  return w && h ? { x, y, width: w, height: h, data: new Uint8Array(w * h).fill(1) } : null;
}
/** Rectangular marquee with integer corner arcs. Radius zero is Aseprite's
 * hard rectangle; the radius is capped to half the shorter dimension. */
export function roundedRectangleSelection(
  a: Point,
  b: Point,
  width: number,
  height: number,
  requestedRadius: number,
): PixelMask | null {
  const rectangle = rectangleSelection(a, b, width, height);
  if (!rectangle) return null;
  const radius = Math.min(
    Math.floor((Math.min(rectangle.width, rectangle.height) - 1) / 2),
    Math.max(0, Math.round(Number.isFinite(requestedRadius) ? requestedRadius : 0)),
  );
  if (!radius) return rectangle;
  const { x, y, width: w, height: h } = rectangle,
    right = x + w - 1,
    bottom = y + h - 1,
    leftArcCenter = x + radius,
    rightArcCenter = right - radius,
    topArcCenter = y + radius,
    bottomArcCenter = bottom - radius,
    data = new Uint8Array(w * h);
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const xIn = x + px,
        yIn = y + py,
        cx = Math.max(leftArcCenter, Math.min(rightArcCenter, xIn)),
        cy = Math.max(topArcCenter, Math.min(bottomArcCenter, yIn));
      if ((xIn - cx) ** 2 + (yIn - cy) ** 2 <= radius ** 2) data[py * w + px] = 1;
    }
  return compactSelection({ x, y, width: w, height: h, data });
}
/** MIT-licensed doc/algo.cpp ellipse fill, including its small-diameter corrections. */
export function selectionEllipseSpans(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  span: (x: number, y: number, end: number) => void,
) {
  if (x0 > x1) [x0, x1] = [x1, x0];
  if (y0 > y1) [y0, y1] = [y1, y0];
  const w = x1 - x0 + 1,
    h = y1 - y0 + 1;
  const extra = (n: number) =>
    (n === 8 || n === 12 || n === 22 ? 1 : 0) - (n > 5 && n % 2 === 0 ? 1 : 0);
  const hp = extra(w),
    vp = extra(h);
  x1 -= hp;
  y1 -= vp;
  let a = Math.abs(x1 - x0),
    b = Math.abs(y1 - y0),
    b1 = b & 1,
    dx = 4 * (1 - a) * b * b,
    dy = 4 * (b1 + 1) * a * a,
    err = dx + dy + b1 * a * a;
  y0 += Math.trunc((b + 1) / 2);
  y1 = y0 - b1;
  a = 8 * a * a;
  b1 = 8 * b * b;
  const initialY0 = y0,
    initialY1 = y1,
    initialX0 = x0,
    initialX1 = x1 + hp;
  do {
    span(x0, y0 + vp, x1 + hp);
    span(x0, y1, x1 + hp);
    const e2 = 2 * err;
    if (e2 <= dy) {
      y0++;
      y1--;
      dy += a;
      err += dy;
    }
    if (e2 >= dx || 2 * err > dy) {
      x0++;
      x1--;
      dx += b1;
      err += dx;
    }
  } while (x0 <= x1);
  while (y0 + vp - y1 + 1 <= h) {
    span(x0 - 1, y0 + vp, x0 - 1);
    span(x1 + 1 + hp, y0 + vp, x1 + 1 + hp);
    y0++;
    span(x0 - 1, y1, x0 - 1);
    span(x1 + 1 + hp, y1--, x1 + 1 + hp);
  }
  if (vp > 0) for (let y = initialY1 + 1; y < initialY0 + vp; y++) span(initialX0, y, initialX1);
}
export function ellipseSelection(
  a: Point,
  b: Point,
  width: number,
  height: number,
): PixelMask | null {
  const left = Math.max(0, Math.min(Math.floor(a.x), Math.floor(b.x))),
    top = Math.max(0, Math.min(Math.floor(a.y), Math.floor(b.y)));
  const right = Math.min(width, Math.max(Math.floor(a.x), Math.floor(b.x)) + 1),
    bottom = Math.min(height, Math.max(Math.floor(a.y), Math.floor(b.y)) + 1);
  if (right <= left || bottom <= top) return null;
  const w = right - left,
    h = bottom - top,
    data = new Uint8Array(w * h);
  selectionEllipseSpans(
    Math.floor(a.x),
    Math.floor(a.y),
    Math.floor(b.x),
    Math.floor(b.y),
    (x, y, end) => {
      if (y < top || y >= bottom) return;
      const start = Math.max(left, x),
        stop = Math.min(right, end + 1);
      if (stop > start) data.fill(1, (y - top) * w + start - left, (y - top) * w + stop - left);
    },
  );
  return compactSelection({ x: left, y: top, width: w, height: h, data });
}
function matches(
  buffer: PixelBuffer,
  index: number,
  color: Rgba,
  tolerance: number,
  transparentEqual: boolean,
) {
  const d = buffer.data,
    i = index * 4;
  if (transparentEqual && d[i + 3] === 0 && color[3] === 0) return true;
  return (
    Math.abs(color[0] - d[i]) <= tolerance &&
    Math.abs(color[1] - d[i + 1]) <= tolerance &&
    Math.abs(color[2] - d[i + 2]) <= tolerance &&
    Math.abs(color[3] - d[i + 3]) <= tolerance
  );
}
export function colorRangeSelection(
  buffer: PixelBuffer,
  color: Rgba,
  tolerance = 0,
): PixelMask | null {
  tolerance = Math.max(
    0,
    Math.min(UINT8_MAX, Math.round(Number.isFinite(tolerance) ? tolerance : 0)),
  );
  const { width, height } = buffer,
    data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++)
    if (matches(buffer, i, color, tolerance, false)) data[i] = 1;
  return compactSelection({ x: 0, y: 0, width, height, data });
}
export function magicWandSelection(
  buffer: PixelBuffer,
  point: Point,
  tolerance = 0,
  contiguous = true,
): PixelMask | null {
  const { width, height } = buffer,
    x = Math.floor(point.x),
    y = Math.floor(point.y);
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  tolerance = Math.max(
    0,
    Math.min(UINT8_MAX, Math.round(Number.isFinite(tolerance) ? tolerance : 0)),
  );
  const i = (y * width + x) * 4,
    color = Array.from(buffer.data.subarray(i, i + 4)) as unknown as Rgba,
    data = new Uint8Array(width * height);
  if (!contiguous) {
    for (let p = 0; p < data.length; p++)
      if (matches(buffer, p, color, tolerance, true)) data[p] = 1;
  } else {
    // Queue horizontal runs, not four neighbour arrays per selected pixel.
    // The source is immutable; the output doubles as the visited bitmap.
    const stack = [y * width + x];
    while (stack.length) {
      const p = stack.pop()!;
      if (data[p]) continue;
      const py = Math.floor(p / width),
        row = py * width;
      let left = p - row,
        right = left;
      while (
        left > 0 &&
        !data[row + left - 1] &&
        matches(buffer, row + left - 1, color, tolerance, true)
      )
        left--;
      while (
        right + 1 < width &&
        !data[row + right + 1] &&
        matches(buffer, row + right + 1, color, tolerance, true)
      )
        right++;
      data.fill(1, row + left, row + right + 1);
      for (let ny = py - 1; ny <= py + 1; ny += 2) {
        if (ny < 0 || ny >= height) continue;
        let inRun = false;
        const nextRow = ny * width;
        for (let sx = left; sx <= right; sx++) {
          const candidate =
            !data[nextRow + sx] && matches(buffer, nextRow + sx, color, tolerance, true);
          if (candidate && !inRun) stack.push(nextRow + sx);
          inRun = candidate;
        }
      }
    }
  }
  return compactSelection({ x: 0, y: 0, width, height, data });
}
export function modifySelection(
  mask: PixelMask | null,
  operation: SelectionModifier,
  radius: number,
  brush: "circle" | "square",
  width: number,
  height: number,
): PixelMask | null {
  if (!mask) return null;
  radius = Math.max(1, Math.min(100, Math.round(Number.isFinite(radius) ? radius : 1)));
  const margin = operation === SelectionModifier.Expand ? radius : 0;
  const left = Math.max(0, mask.x - margin),
    top = Math.max(0, mask.y - margin),
    right = Math.min(width, mask.x + mask.width + margin),
    bottom = Math.min(height, mask.y + mask.height + margin);
  if (right <= left || bottom <= top) return null;
  // A summed-area table makes square morphology independent of radius.
  // Aseprite ellipse rows are grouped into disjoint rectangles, retaining its
  // exact integer kernel rather than approximating it with a geometric disk.
  const sourceLeft = Math.max(mask.x, left - radius),
    sourceTop = Math.max(mask.y, top - radius);
  const sourceRight = Math.min(mask.x + mask.width, right + radius),
    sourceBottom = Math.min(mask.y + mask.height, bottom + radius);
  const sw = sourceRight - sourceLeft,
    sh = sourceBottom - sourceTop,
    pitch = sw + 1;
  if (sw <= 0 || sh <= 0) return null;
  // Keep only the integral rows that a radius-sized kernel can reference.
  // A 4096² selection needs a small row ring, not another 64 MiB full table.
  const ringRows = Math.min(sh + 1, radius * 2 + 2);
  const sums = new Uint32Array(pitch * ringRows);
  let populatedRow = 0;
  const populate = (through: number) => {
    while (populatedRow < through) {
      const y = populatedRow++,
        source = (sourceTop - mask.y + y) * mask.width + sourceLeft - mask.x;
      const row = (populatedRow % ringRows) * pitch,
        previous = (y % ringRows) * pitch;
      let total = 0;
      sums[row] = 0;
      for (let x = 0; x < sw; x++) {
        total += mask.data[source + x] ? 1 : 0;
        sums[row + x + 1] = sums[previous + x + 1] + total;
      }
    }
  };
  type Band = { x0: number; x1: number; y0: number; y1: number; area: number };
  const bands: Band[] = [];
  if (brush === "square")
    bands.push({
      x0: -radius,
      x1: radius + 1,
      y0: -radius,
      y1: radius + 1,
      area: (radius * 2 + 1) ** 2,
    });
  else {
    const size = radius * 2 + 1,
      starts = new Int32Array(size).fill(size),
      ends = new Int32Array(size).fill(-1);
    selectionEllipseSpans(0, 0, size - 1, size - 1, (x, y, end) => {
      starts[y] = Math.min(starts[y], x);
      ends[y] = Math.max(ends[y], end);
    });
    for (let y = 0; y < size; y++) {
      if (ends[y] < starts[y]) continue;
      const x0 = starts[y] - radius,
        x1 = ends[y] + 1 - radius,
        last = bands[bands.length - 1];
      if (last && last.x0 === x0 && last.x1 === x1 && last.y1 === y - radius) {
        last.y1++;
        last.area += x1 - x0;
      } else bands.push({ x0, x1, y0: y - radius, y1: y - radius + 1, area: x1 - x0 });
    }
  }
  const w = right - left,
    h = bottom - top,
    data = new Uint8Array(w * h);
  // Clip each kernel band's columns once; its row bounds are shared by the
  // entire scanline. Inner pixels now require only four integral-table reads.
  const columns = bands.map((band) => ({
    start: Int32Array.from({ length: w }, (_, x) =>
      Math.max(0, Math.min(sw, left + x + band.x0 - sourceLeft)),
    ),
    end: Int32Array.from({ length: w }, (_, x) =>
      Math.max(0, Math.min(sw, left + x + band.x1 - sourceLeft)),
    ),
  }));
  const rowStart = new Int32Array(bands.length),
    rowEnd = new Int32Array(bands.length);
  for (let y = top; y < bottom; y++) {
    populate(Math.max(0, Math.min(sh, y + radius + 1 - sourceTop)));
    for (let i = 0; i < bands.length; i++) {
      rowStart[i] = (Math.max(0, Math.min(sh, y + bands[i].y0 - sourceTop)) % ringRows) * pitch;
      rowEnd[i] = (Math.max(0, Math.min(sh, y + bands[i].y1 - sourceTop)) % ringRows) * pitch;
    }
    for (let x = left; x < right; x++) {
      const center = selectionContains(mask, x, y),
        out = (y - top) * w + x - left;
      if (operation === SelectionModifier.Expand && center) {
        data[out] = 1;
        continue;
      }
      if (operation !== SelectionModifier.Expand && !center) continue;
      let selected = operation === SelectionModifier.Contract;
      for (let i = 0; i < bands.length; i++) {
        const a = columns[i].start[x - left],
          c = columns[i].end[x - left],
          b = rowStart[i],
          d = rowEnd[i];
        const n = sums[d + c] - sums[b + c] - sums[d + a] + sums[b + a];
        if (operation === SelectionModifier.Expand) {
          if (n) {
            selected = true;
            break;
          }
        } else if (n !== bands[i].area) {
          selected = operation === SelectionModifier.Border;
          break;
        }
      }
      if (selected) data[out] = 1;
    }
  }
  return compactSelection({ x: left, y: top, width: w, height: h, data });
}

/** Aseprite stroke_selection first applies ModifySelection(Border, 1, circle) to
 * the mask, then fills that mask. Keep the original bounds (including any
 * off-canvas portion); the caller clips only when painting into a cel. */
export function selectionBorderMask(mask: PixelMask): PixelMask {
  const width = mask.width,
    height = mask.height,
    data = new Uint8Array(mask.data.length);
  if (!width || !height) return { ...mask, data };
  const kernel = new Uint8Array(9);
  selectionEllipseSpans(0, 0, 2, 2, (x, y, end) => {
    for (let px = Math.max(0, x); px <= Math.min(2, end); px++) kernel[y * 3 + px] = 1;
  });
  // modify_selection builds the brush kernel, then clears the centre pixel.
  kernel[4] = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = y * width + x;
      if (!mask.data[at]) continue;
      for (let ky = 0; ky < 3 && !data[at]; ky++)
        for (let kx = 0; kx < 3; kx++) {
          if (!kernel[ky * 3 + kx]) continue;
          const sx = x + kx - 1,
            sy = y + ky - 1;
          if (sx < 0 || sy < 0 || sx >= width || sy >= height || !mask.data[sy * width + sx]) {
            data[at] = 1;
            break;
          }
        }
    }
  return { ...mask, data };
}

/** Wand's ACTIVE_LAYER reference is the canvas-sized active cel, including
 * transparent pixels outside the cel's storage bounds (ToolLoopImpl source). */
export function selectionLayerReference(
  layer: { pixels: PixelBuffer; x: number; y: number },
  width: number,
  height: number,
): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4),
    source = layer.pixels;
  const left = Math.max(0, layer.x),
    right = Math.min(width, layer.x + source.width);
  if (right > left)
    for (let y = Math.max(0, layer.y); y < Math.min(height, layer.y + source.height); y++) {
      const begin = ((y - layer.y) * source.width + left - layer.x) * 4;
      data.set(source.data.subarray(begin, begin + (right - left) * 4), (y * width + left) * 4);
    }
  return { width, height, data };
}
/** Color Range reads the image/cel, not the transparent canvas surroundings. */
export function layerColorRangeSelection(
  layer: { pixels: PixelBuffer; x: number; y: number },
  color: Rgba,
  tolerance = 0,
): PixelMask | null {
  const mask = colorRangeSelection(layer.pixels, color, tolerance);
  return mask ? { ...mask, x: mask.x + layer.x, y: mask.y + layer.y } : null;
}

export const isSelectionTool = (tool: string): boolean =>
  ["marquee", "lasso", "elliptical_marquee", "polygonal_lasso", "magic_wand"].includes(tool);

/** MaskByColor requires HasActiveImage, not an editable/visible layer. Aseprite
 * ContextFlags derives this from Site::image, so groups and empty cels fail. */
export function canColorRangeSelection(doc: EditorDocument | null): boolean {
  if (!doc) return false;
  if (doc.timeline)
    return !!doc.timeline.frames[doc.timeline.activeFrame]?.cels[doc.timeline.activeLayer];
  return !doc.layer.emptyCel && doc.layer.pixels.width > 0 && doc.layer.pixels.height > 0;
}

/** MaskByColor's generateMask operates in cel coordinates after offsetOrigin,
 * and deliberately retains pixels outside the sprite. With no original mask
 * its mode buttons all create the newly matched color mask. */
export function combineColorRangeSelection(
  base: PixelMask | null,
  incoming: PixelMask | null,
  mode: SelectionMode,
): PixelMask | null {
  if (!base || mode === SelectionMode.Replace) return incoming ? compactSelection(incoming) : null;
  if (!incoming) return mode === SelectionMode.Intersect ? null : compactSelection(base);
  const left =
    mode === SelectionMode.Intersect
      ? Math.max(base.x, incoming.x)
      : mode === SelectionMode.Subtract
        ? base.x
        : Math.min(base.x, incoming.x);
  const top =
    mode === SelectionMode.Intersect
      ? Math.max(base.y, incoming.y)
      : mode === SelectionMode.Subtract
        ? base.y
        : Math.min(base.y, incoming.y);
  const right =
    mode === SelectionMode.Intersect
      ? Math.min(base.x + base.width, incoming.x + incoming.width)
      : mode === SelectionMode.Subtract
        ? base.x + base.width
        : Math.max(base.x + base.width, incoming.x + incoming.width);
  const bottom =
    mode === SelectionMode.Intersect
      ? Math.min(base.y + base.height, incoming.y + incoming.height)
      : mode === SelectionMode.Subtract
        ? base.y + base.height
        : Math.max(base.y + base.height, incoming.y + incoming.height);
  const width = right - left,
    height = bottom - top;
  if (width <= 0 || height <= 0) return null;
  assertDimension(width, "selection width");
  assertDimension(height, "selection height");
  assertPixelCount(width, height, "selection");
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const a = selectionContains(base, x + left, y + top),
        b = selectionContains(incoming, x + left, y + top);
      data[y * width + x] = (
        mode === SelectionMode.Add ? a || b : mode === SelectionMode.Subtract ? a && !b : a && b
      )
        ? 1
        : 0;
    }
  return compactSelection({ x: left, y: top, width, height, data });
}
