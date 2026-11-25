import { UINT8_MAX, UINT8_MIDPOINT } from "$/base/numeric-constants";
import type { PixelBuffer, PixelMask, Rect, Rgba } from "$/base/primitives";
import { createOpaquePaletteMatcher } from "$/color";
import { selectionContains } from "$/selection/operations";

export enum PixelCleanupPass {
  RemoveOrphans = "removeOrphans",
  CleanDoubles = "cleanDoubles",
  SnapToPalette = "snapToPalette",
  CrispAlpha = "crispAlpha",
}
export type PixelCleanupOptions = Partial<Record<PixelCleanupPass, boolean>>;

interface CleanupArea {
  selection?: PixelMask | null;
  bounds?: Rect;
}
interface CleanupContext extends CleanupArea {
  palette?: readonly Rgba[];
  background?: boolean;
}

const CHANNELS = 4;
const ALPHA = 3;
const OUTSIDE = -1;
const ORTHOGONAL = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
const DIAGONAL = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

function somePixel(
  source: PixelBuffer,
  { selection, bounds }: CleanupArea,
  visit: (at: number, x: number, y: number) => boolean | void,
): boolean {
  const { width, height } = source;
  const left = Math.max(0, bounds?.x ?? 0, selection?.x ?? 0);
  const top = Math.max(0, bounds?.y ?? 0, selection?.y ?? 0);
  const right = Math.min(
    width,
    bounds ? bounds.x + bounds.width : width,
    selection ? selection.x + selection.width : width,
  );
  const bottom = Math.min(
    height,
    bounds ? bounds.y + bounds.height : height,
    selection ? selection.y + selection.height : height,
  );
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++)
      if (
        (!selection || selectionContains(selection, x, y)) &&
        visit((y * width + x) * CHANNELS, x, y)
      )
        return true;
  return false;
}

function isPartialAlpha(alpha: number): boolean {
  return alpha > 0 && alpha < UINT8_MAX;
}

export function hasSemiTransparentPixels(source: PixelBuffer, area: CleanupArea = {}): boolean {
  return somePixel(source, area, (at) => isPartialAlpha(source.data[at + ALPHA]));
}

function offset(source: PixelBuffer, x: number, y: number): number {
  return x < 0 || y < 0 || x >= source.width || y >= source.height
    ? OUTSIDE
    : (y * source.width + x) * CHANNELS;
}

function alphaAt(source: PixelBuffer, at: number): number {
  return at === OUTSIDE ? 0 : source.data[at + ALPHA];
}

function rgbKey(data: Uint8ClampedArray, at: number): number {
  return (data[at] << 16) | (data[at + 1] << 8) | data[at + 2];
}

/** Copy only on the first actual write. Each neighborhood pass reads its original
 * buffer so a replacement cannot influence later candidates in the same pass. */
function changePixels(
  source: PixelBuffer,
  area: CleanupArea,
  visit: (
    at: number,
    x: number,
    y: number,
    writable: () => Uint8ClampedArray,
    current: () => Uint8ClampedArray,
  ) => void,
): PixelBuffer {
  let data = source.data;
  const writable = () => {
    if (data === source.data) data = data.slice();
    return data;
  };
  const current = () => data;
  somePixel(source, area, (at, x, y) => visit(at, x, y, writable, current));
  return data === source.data ? source : { width: source.width, height: source.height, data };
}

function crispAlpha(source: PixelBuffer, area: CleanupArea): PixelBuffer {
  return changePixels(source, area, (at, _x, _y, write) => {
    const alpha = source.data[at + ALPHA];
    if (!isPartialAlpha(alpha)) return;
    if (alpha < UINT8_MIDPOINT) write().fill(0, at, at + CHANNELS);
    else write()[at + ALPHA] = UINT8_MAX;
  });
}

function removeOrphans(source: PixelBuffer, area: CleanupArea, background: boolean): PixelBuffer {
  const { data } = source;
  const neighbors: number[] = [];
  const votes = new Map<number, number>();
  return changePixels(source, area, (at, x, y, write) => {
    if (alphaAt(source, at) !== UINT8_MAX) return;
    neighbors.length = 0;
    let touching = 0;
    for (const [dx, dy] of ORTHOGONAL) {
      const neighbor = offset(source, x + dx, y + dy);
      const alpha = alphaAt(source, neighbor);
      if (alpha !== 0) touching++;
      if (alpha === UINT8_MAX) neighbors.push(neighbor);
    }
    if (touching === 0 && !background) {
      write().fill(0, at, at + CHANNELS);
      return;
    }
    // Interior orphans must have four opaque sides and a strict opaque-neighbor
    // majority. A matching diagonal preserves thin features and paired highlights.
    if (neighbors.length !== ORTHOGONAL.length) return;
    for (const [dx, dy] of DIAGONAL) {
      const neighbor = offset(source, x + dx, y + dy);
      if (alphaAt(source, neighbor) === UINT8_MAX) neighbors.push(neighbor);
    }
    const center = rgbKey(data, at);
    votes.clear();
    let replacement: number | undefined;
    for (const neighbor of neighbors) {
      const key = rgbKey(data, neighbor);
      if (key === center) return;
      const count = (votes.get(key) ?? 0) + 1;
      votes.set(key, count);
      if (count * 2 > neighbors.length) replacement = neighbor;
    }
    if (replacement !== undefined)
      write().set(data.subarray(replacement, replacement + CHANNELS), at);
  });
}

function cleanDoubles(source: PixelBuffer, area: CleanupArea): PixelBuffer {
  const { data } = source;
  const arms: number[] = [];
  return changePixels(source, area, (at, x, y, write, current) => {
    if (alphaAt(source, at) !== UINT8_MAX) return;
    arms.length = 0;
    for (let i = 0; i < ORTHOGONAL.length; i++) {
      const [dx, dy] = ORTHOGONAL[i];
      const neighbor = offset(source, x + dx, y + dy);
      const alpha = alphaAt(source, neighbor);
      if (alpha === 0) continue;
      if (alpha !== UINT8_MAX || rgbKey(data, at) !== rgbKey(data, neighbor)) return;
      // A previously removed corner cannot serve as an arm of another corner.
      if (current()[neighbor + ALPHA] === 0) return;
      arms.push(i);
    }
    if (arms.length !== 2) return;
    const dx = ORTHOGONAL[arms[0]][0] + ORTHOGONAL[arms[1]][0];
    const dy = ORTHOGONAL[arms[0]][1] + ORTHOGONAL[arms[1]][1];
    if (dx === 0 || dy === 0) return;
    // A filled inner corner is part of a 2×2 block. A filled outer diagonal
    // could be a branch that would detach when the elbow is removed.
    if (alphaAt(source, offset(source, x + dx, y + dy)) !== 0) return;
    if (alphaAt(source, offset(source, x - dx, y - dy)) !== 0) return;
    write().fill(0, at, at + CHANNELS);
  });
}

function snapToPalette(
  source: PixelBuffer,
  area: CleanupArea,
  palette: readonly Rgba[],
): PixelBuffer {
  const nearest = createOpaquePaletteMatcher(palette);
  if (!nearest) return source;
  const partialColors = new Set(
    palette.filter((color) => isPartialAlpha(color[ALPHA])).map((color) => color.join(",")),
  );
  const { data } = source;
  return changePixels(source, area, (at, _x, _y, write) => {
    const r = data[at],
      g = data[at + 1],
      b = data[at + 2],
      a = data[at + ALPHA];
    if (!a || (a < UINT8_MAX && partialColors.has(`${r},${g},${b},${a}`))) return;
    const color = nearest(r, g, b);
    if (r !== color[0] || g !== color[1] || b !== color[2])
      write().set([color[0], color[1], color[2], a], at);
  });
}

/** Scope limits writes. Neighbor classification can see the entire source, including
 * pixels just beyond the selection. Alpha is cleaned before judging connectivity,
 * and palette snapping runs last to keep the original outline/color evidence. */
export function cleanPixels(
  source: PixelBuffer,
  options: PixelCleanupOptions,
  context: CleanupContext = {},
): PixelBuffer {
  const { background = false, palette = [] } = context;
  let output = source;
  if (options.crispAlpha && !background) output = crispAlpha(output, context);
  if (options.removeOrphans) output = removeOrphans(output, context, background);
  if (options.cleanDoubles && !background) output = cleanDoubles(output, context);
  if (options.snapToPalette) output = snapToPalette(output, context, palette);
  return output;
}
