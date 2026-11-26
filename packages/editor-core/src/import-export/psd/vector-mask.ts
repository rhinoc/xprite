import { UINT8_MAX, type PixelBuffer } from "$/base";
import type { PsdBezierKnot, PsdVectorMask, PsdVectorSubpath } from "$/import-export/psd/model";

const RGBA_CHANNELS = 4;
const SUPERSAMPLE_GRID = 4;
const SUPERSAMPLE_COUNT = SUPERSAMPLE_GRID * SUPERSAMPLE_GRID;
const BEZIER_FLATNESS_SQ = 0.08;
const MAX_BEZIER_DEPTH = 8;

interface Edge {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly invDy: number;
  readonly dir: 1 | -1;
}

interface PreparedSubpath {
  readonly operation: PsdVectorSubpath["operation"];
  readonly edges: readonly Edge[];
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

function flattenCubic(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  depth: number,
  points: number[],
): void {
  const dx = x3 - x0;
  const dy = y3 - y0;
  const d1 = Math.abs((x1 - x3) * dy - (y1 - y3) * dx);
  const d2 = Math.abs((x2 - x3) * dy - (y2 - y3) * dx);
  const flatness = (d1 + d2) * (d1 + d2);
  if (depth >= MAX_BEZIER_DEPTH || flatness <= BEZIER_FLATNESS_SQ * (dx * dx + dy * dy + 1e-6)) {
    points.push(x3, y3);
    return;
  }
  const x01 = (x0 + x1) * 0.5;
  const y01 = (y0 + y1) * 0.5;
  const x12 = (x1 + x2) * 0.5;
  const y12 = (y1 + y2) * 0.5;
  const x23 = (x2 + x3) * 0.5;
  const y23 = (y2 + y3) * 0.5;
  const x012 = (x01 + x12) * 0.5;
  const y012 = (y01 + y12) * 0.5;
  const x123 = (x12 + x23) * 0.5;
  const y123 = (y12 + y23) * 0.5;
  const x0123 = (x012 + x123) * 0.5;
  const y0123 = (y012 + y123) * 0.5;
  flattenCubic(x0, y0, x01, y01, x012, y012, x0123, y0123, depth + 1, points);
  flattenCubic(x0123, y0123, x123, y123, x23, y23, x3, y3, depth + 1, points);
}

function subpathToEdges(subpath: PsdVectorSubpath): Edge[] {
  const knots: readonly PsdBezierKnot[] = subpath.knots;
  if (knots.length < 2) return [];
  const poly: number[] = [knots[0].points[2], knots[0].points[3]];
  const segmentCount = subpath.open ? knots.length - 1 : knots.length;
  for (let i = 0; i < segmentCount; i++) {
    const a = knots[i].points;
    const b = knots[(i + 1) % knots.length].points;
    flattenCubic(a[2], a[3], a[4], a[5], b[0], b[1], b[2], b[3], 0, poly);
  }
  const edges: Edge[] = [];
  for (let i = 0; i + 3 < poly.length; i += 2) {
    const x0 = poly[i];
    const y0 = poly[i + 1];
    const x1 = poly[i + 2];
    const y1 = poly[i + 3];
    if (y0 === y1) continue;
    if (y0 < y1) {
      edges.push({ x0, y0, x1, y1, invDy: (x1 - x0) / (y1 - y0), dir: 1 });
    } else {
      edges.push({ x0: x1, y0: y1, x1: x0, y1: y0, invDy: (x0 - x1) / (y0 - y1), dir: -1 });
    }
  }
  return edges;
}

/**
 * Fills `subRow[0..subWidth)` with 0/1 indicating non-zero winding coverage at sub-scanline `sampleY`,
 * where sub-column `s` corresponds to `x = (s + 0.5) / SUPERSAMPLE_GRID`.
 */
function rasterizeSubpathScanline(
  edges: readonly Edge[],
  sampleY: number,
  subWidth: number,
  subRow: Uint8Array,
  ixBuf: number[],
  dirBuf: number[],
): void {
  subRow.fill(0);
  ixBuf.length = 0;
  dirBuf.length = 0;

  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (sampleY < e.y0 || sampleY >= e.y1) continue;
    const ix = e.x0 + (sampleY - e.y0) * e.invDy;
    // Insertion sort keeps tiny active edge lists allocation-free and fast.
    let pos = ixBuf.length;
    ixBuf.push(ix);
    dirBuf.push(e.dir);
    while (pos > 0 && ixBuf[pos - 1] > ix) {
      ixBuf[pos] = ixBuf[pos - 1];
      dirBuf[pos] = dirBuf[pos - 1];
      pos--;
    }
    ixBuf[pos] = ix;
    dirBuf[pos] = e.dir;
  }

  const count = ixBuf.length;
  if (count === 0) return;

  let winding = 0;
  let spanStart = 0;
  for (let i = 0; i < count; i++) {
    const prevWinding = winding;
    winding += dirBuf[i];
    if (prevWinding === 0 && winding !== 0) {
      // First sub-column whose center `(s + 0.5) / 4 > ixBuf[i]` (equivalently `ix < center`).
      spanStart = Math.max(0, Math.ceil(ixBuf[i] * SUPERSAMPLE_GRID - 0.5));
    } else if (prevWinding !== 0 && winding === 0) {
      const spanEnd = Math.min(subWidth, Math.ceil(ixBuf[i] * SUPERSAMPLE_GRID - 0.5));
      if (spanEnd > spanStart) subRow.fill(1, spanStart, spanEnd);
    }
  }
  if (winding !== 0 && spanStart < subWidth) {
    subRow.fill(1, spanStart, subWidth);
  }
}

/**
 * Rasterizes Photoshop `vectorMask.paths` into an RGBA mask buffer covering `[0, width) × [0, height)`.
 * Uses O(H · (E + W)) 4×4 supersampled scanline span fill.
 * Returns null if the vector mask is disabled or contains no closed geometry.
 */
export function rasterizeVectorMask(
  vectorMask: PsdVectorMask | undefined,
  width: number,
  height: number,
): PixelBuffer | null {
  if (!vectorMask || vectorMask.disabled || vectorMask.paths.length === 0) return null;

  const prepared: PreparedSubpath[] = [];
  let globalMinY = Infinity;
  let globalMaxY = -Infinity;
  for (const subpath of vectorMask.paths) {
    const edges = subpathToEdges(subpath);
    if (edges.length === 0) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const edge of edges) {
      if (edge.x0 < minX) minX = edge.x0;
      if (edge.x1 < minX) minX = edge.x1;
      if (edge.x0 > maxX) maxX = edge.x0;
      if (edge.x1 > maxX) maxX = edge.x1;
      if (edge.y0 < minY) minY = edge.y0;
      if (edge.y1 > maxY) maxY = edge.y1;
    }
    if (minY < globalMinY) globalMinY = minY;
    if (maxY > globalMaxY) globalMaxY = maxY;
    prepared.push({ operation: subpath.operation, edges, minX, maxX, minY, maxY });
  }
  if (prepared.length === 0) return null;

  const data = new Uint8ClampedArray(width * height * RGBA_CHANNELS);
  const step = 1 / SUPERSAMPLE_GRID;
  const halfStep = step * 0.5;
  const firstOp = prepared[0].operation;
  // When the first subpath is "subtract", Photoshop starts with a full-canvas filled mask.
  const initialFilled = firstOp === "subtract";
  const emptyRowFill = initialFilled !== vectorMask.invert ? UINT8_MAX : 0;

  const subWidth = width * SUPERSAMPLE_GRID;
  const accumRow = new Uint8Array(subWidth);
  const subRow = new Uint8Array(subWidth);
  const hitRow = new Uint8Array(width);
  const ixBuf: number[] = [];
  const dirBuf: number[] = [];
  const pathCount = prepared.length;

  for (let y = 0; y < height; y++) {
    if (y + 1 < globalMinY || y > globalMaxY) {
      if (emptyRowFill > 0) {
        const rowBase = y * width * RGBA_CHANNELS;
        for (let x = 0; x < width; x++) {
          const offset = rowBase + x * RGBA_CHANNELS;
          data[offset] = emptyRowFill;
          data[offset + 1] = emptyRowFill;
          data[offset + 2] = emptyRowFill;
          data[offset + 3] = UINT8_MAX;
        }
      }
      continue;
    }

    hitRow.fill(0);
    for (let sy = 0; sy < SUPERSAMPLE_GRID; sy++) {
      const sampleY = y + halfStep + sy * step;
      accumRow.fill(initialFilled ? 1 : 0);

      for (let p = 0; p < pathCount; p++) {
        const sub = prepared[p];
        const touchesY = sampleY >= sub.minY && sampleY <= sub.maxY;
        if (!touchesY) {
          if (p === 0 && !initialFilled) {
            accumRow.fill(0);
          } else if (sub.operation === "intersect") {
            accumRow.fill(0);
          }
          continue;
        }

        rasterizeSubpathScanline(sub.edges, sampleY, subWidth, subRow, ixBuf, dirBuf);
        if (p === 0 && !initialFilled) {
          accumRow.set(subRow);
        } else if (sub.operation === "combine") {
          for (let s = 0; s < subWidth; s++) accumRow[s] |= subRow[s];
        } else if (sub.operation === "subtract") {
          for (let s = 0; s < subWidth; s++) accumRow[s] &= subRow[s] ^ 1;
        } else if (sub.operation === "intersect") {
          for (let s = 0; s < subWidth; s++) accumRow[s] &= subRow[s];
        } else {
          for (let s = 0; s < subWidth; s++) accumRow[s] ^= subRow[s];
        }
      }

      if (vectorMask.invert) {
        for (let x = 0; x < width; x++) {
          const base = x * SUPERSAMPLE_GRID;
          hitRow[x] +=
            SUPERSAMPLE_GRID -
            (accumRow[base] + accumRow[base + 1] + accumRow[base + 2] + accumRow[base + 3]);
        }
      } else {
        for (let x = 0; x < width; x++) {
          const base = x * SUPERSAMPLE_GRID;
          hitRow[x] +=
            accumRow[base] + accumRow[base + 1] + accumRow[base + 2] + accumRow[base + 3];
        }
      }
    }

    const rowBase = y * width * RGBA_CHANNELS;
    for (let x = 0; x < width; x++) {
      const hits = hitRow[x];
      const value =
        hits === 0
          ? 0
          : hits === SUPERSAMPLE_COUNT
            ? UINT8_MAX
            : Math.round((hits / SUPERSAMPLE_COUNT) * UINT8_MAX);
      const offset = rowBase + x * RGBA_CHANNELS;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = UINT8_MAX;
    }
  }

  return { width, height, data };
}
