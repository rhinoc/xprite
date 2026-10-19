import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";

/**
 * Tilt estimation and straightening for pixel grids that were photographed, scanned or rotated a
 * little before they reached the importer. The tilt is the angle that makes the projection
 * profiles of the vertical and horizontal edges sharpest: for the right angle every grid line
 * collapses into one histogram bin, for any other angle the lines smear across many bins.
 */
const CHANNELS = 4;
/** Largest tilt searched (degrees, either direction). Beyond it the image is refused. */
export const MAX_TILT_DEGREES = 10;
/** Tilts below this are noise or a perfectly aligned image: the image is left untouched. */
export const MIN_TILT_DEGREES = 0.15;
/** The tilted profile must be at least this much sharper than the unrotated one. */
const MIN_SHARPNESS_GAIN = 1.25;
/** Colour step (0..1) that counts as an edge; keeps JPEG noise and soft gradients out. */
const EDGE_STEP = 0.1;
const MAX_POINTS = 90_000;
const COARSE_SIZE = 512;
const COARSE_STEP = 0.1;
const FINE_SPAN = 0.15;
const DEGREES = Math.PI / 180;
const MIN_EDGE_POINTS = 64;
/** A best angle this close to the search limit means the real tilt is probably outside it. */
const LIMIT_MARGIN = 0.35;

export interface TiltEstimate {
  /** Degrees to rotate the content by to straighten it; 0 when it needs none. */
  angle: number;
  /** Sharpness at the best angle divided by sharpness unrotated (1 = no evidence of tilt). */
  gain: number;
  /** The grid looks tilted by more than the search range: refuse instead of guessing. */
  extreme: boolean;
}
const UPRIGHT: TiltEstimate = { angle: 0, gain: 1, extreme: false };

interface EdgePoints {
  /** Vertical edges (colour changes between horizontal neighbours): x, y pairs. */
  vertical: Float32Array;
  /** Horizontal edges: x, y pairs. */
  horizontal: Float32Array;
}

function colorStep(data: Uint8ClampedArray, first: number, second: number): number {
  const a = data[first + 3] / UINT8_MAX,
    b = data[second + 3] / UINT8_MAX;
  let difference = Math.abs(a - b);
  for (let c = 0; c < CHANNELS - 1; c++)
    difference = Math.max(
      difference,
      Math.abs(data[first + c] * a - data[second + c] * b) / UINT8_MAX,
    );
  return difference;
}

function thin(points: number[], limit: number): Float32Array {
  const count = points.length / 2;
  const stride = Math.max(1, Math.ceil(count / limit));
  const kept: number[] = [];
  for (let i = 0; i < count; i += stride) kept.push(points[2 * i], points[2 * i + 1]);
  return Float32Array.from(kept);
}

function collectEdges(image: PixelBuffer): EdgePoints {
  const { width, height, data } = image;
  const vertical: number[] = [],
    horizontal: number[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * CHANNELS;
      if (x + 1 < width && colorStep(data, offset, offset + CHANNELS) > EDGE_STEP)
        vertical.push(x + 1, y + 0.5);
      if (y + 1 < height && colorStep(data, offset, offset + width * CHANNELS) > EDGE_STEP)
        horizontal.push(x + 0.5, y + 1);
    }
  return {
    vertical: thin(vertical, MAX_POINTS),
    horizontal: thin(horizontal, MAX_POINTS),
  };
}

/**
 * Sum of squared histogram counts of the edge positions projected on the rotated axes. A larger
 * value means the edges line up into fewer, taller bars.
 */
function sharpness(
  points: EdgePoints,
  degrees: number,
  scale: number,
  bins: Float64Array,
  offset: number,
): number {
  const cos = Math.cos(degrees * DEGREES) * scale,
    sin = Math.sin(degrees * DEGREES) * scale;
  let total = 0;
  const run = (source: Float32Array, along: "u" | "v") => {
    bins.fill(0);
    for (let i = 0; i < source.length; i += 2) {
      const x = source[i],
        y = source[i + 1];
      const position = along === "u" ? x * cos + y * sin : -x * sin + y * cos;
      bins[Math.floor(position + offset)] += 1;
    }
    let sum = 0;
    for (let i = 0; i < bins.length; i++) sum += bins[i] * bins[i];
    total += sum;
  };
  run(points.vertical, "u");
  run(points.horizontal, "v");
  return total / Math.max(1, (points.vertical.length + points.horizontal.length) / 2);
}

function scaled(points: EdgePoints, scale: number): EdgePoints {
  if (scale === 1) return points;
  return {
    vertical: points.vertical.map((value) => value * scale),
    horizontal: points.horizontal.map((value) => value * scale),
  };
}

const cache = new WeakMap<object, TiltEstimate>();

/**
 * Estimate how far the pixel grid in `image` is tilted. Returns an upright estimate when there is
 * no convincing evidence, so images without a grid (photos) and aligned images are never touched.
 */
export function estimateTilt(image: PixelBuffer): TiltEstimate {
  const known = cache.get(image);
  if (known) return known;
  const result = measureTilt(image);
  cache.set(image, result);
  return result;
}

function measureTilt(image: PixelBuffer): TiltEstimate {
  const longest = Math.max(image.width, image.height);
  if (longest < 16) return UPRIGHT;
  const edges = collectEdges(image);
  if (edges.vertical.length / 2 + edges.horizontal.length / 2 < MIN_EDGE_POINTS) return UPRIGHT;

  const bins = new Float64Array(Math.ceil(3 * longest) + 8);
  const offset = longest;
  const evaluate = (points: EdgePoints, degrees: number, scale: number) =>
    sharpness(points, degrees, scale, bins, offset * scale);

  // Coarse pass on a shrunken copy of the coordinates so the narrow peak is not stepped over.
  const coarseScale = Math.min(1, COARSE_SIZE / longest);
  const coarsePoints = scaled(edges, coarseScale);
  let best = 0,
    bestScore = -Infinity;
  const scores = new Map<number, number>();
  for (let step = -MAX_TILT_DEGREES / COARSE_STEP; step <= MAX_TILT_DEGREES / COARSE_STEP; step++) {
    const degrees = Math.round(step * COARSE_STEP * 1000) / 1000;
    const score = evaluate(coarsePoints, degrees, coarseScale);
    scores.set(degrees, score);
    if (score > bestScore) {
      bestScore = score;
      best = degrees;
    }
  }
  // Fine pass at full resolution: one pixel of drift across the image per step.
  const fineStep = Math.max(0.005, Math.min(0.05, 1 / longest / DEGREES / 2));
  let fine = best,
    fineScore = -Infinity;
  for (let degrees = best - FINE_SPAN; degrees <= best + FINE_SPAN + 1e-9; degrees += fineStep) {
    const score = evaluate(edges, degrees, 1);
    if (score > fineScore) {
      fineScore = score;
      fine = degrees;
    }
  }
  const upright = evaluate(edges, 0, 1);
  const gain = upright > 0 ? fineScore / upright : 1;
  const angle = Math.round(fine * 1000) / 1000;
  if (Math.abs(angle) < MIN_TILT_DEGREES || gain < MIN_SHARPNESS_GAIN)
    return { angle: 0, gain, extreme: false };
  if (Math.abs(angle) > MAX_TILT_DEGREES - LIMIT_MARGIN) return { angle: 0, gain, extreme: true };
  return { angle, gain, extreme: false };
}

/**
 * Rotate `image` about its centre by `degrees` so a grid tilted by that angle becomes axis
 * aligned. Same canvas size; samples outside the source repeat the nearest border pixel, and
 * colour is interpolated with premultiplied alpha.
 */
export function straighten(image: PixelBuffer, degrees: number): PixelBuffer {
  if (!degrees) return image;
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data.length);
  const cos = Math.cos(degrees * DEGREES),
    sin = Math.sin(degrees * DEGREES);
  const cx = width / 2,
    cy = height / 2;
  const pick = (x: number, y: number) =>
    (Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))) * CHANNELS;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = x + 0.5 - cx,
        v = y + 0.5 - cy;
      const sx = u * cos - v * sin + cx - 0.5,
        sy = u * sin + v * cos + cy - 0.5;
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy);
      const fx = sx - x0,
        fy = sy - y0;
      const corners = [
        [pick(x0, y0), (1 - fx) * (1 - fy)],
        [pick(x0 + 1, y0), fx * (1 - fy)],
        [pick(x0, y0 + 1), (1 - fx) * fy],
        [pick(x0 + 1, y0 + 1), fx * fy],
      ] as const;
      let alpha = 0,
        r = 0,
        g = 0,
        b = 0;
      for (const [at, weight] of corners) {
        const a = data[at + 3] * weight;
        alpha += a;
        r += data[at] * a;
        g += data[at + 1] * a;
        b += data[at + 2] * a;
      }
      const o = (y * width + x) * CHANNELS;
      if (alpha > 0) {
        out[o] = r / alpha;
        out[o + 1] = g / alpha;
        out[o + 2] = b / alpha;
        out[o + 3] = alpha;
      }
    }
  return { width, height, data: out };
}
