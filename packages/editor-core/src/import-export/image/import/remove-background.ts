import type { PixelBuffer, Rgba } from "$/base/primitives";

const CHANNELS = 4;
const DEFAULT_TOLERANCE = 32;
const BORDER_QUANT = 8;
/** Candidate tolerances for Auto adaptive scoring (inclusive of Ryan's ~24–48 band). */
const AUTO_TOLERANCES = [16, 24, 32, 40, 48, 64, 80, 100] as const;

export enum RemoveBackgroundMode {
  Auto = "auto",
  Manual = "manual",
}

export interface RemoveBackgroundOptions {
  mode?: RemoveBackgroundMode;
  /** Euclidean RGB distance; Manual default 32. Auto ignores this and picks adaptively. */
  tolerance?: number;
  /** Manual key color (RGB used; alpha ignored). Null falls back to Auto border key. */
  keyColor?: Rgba | null;
}

export interface RemoveBackgroundSettings {
  enabled: boolean;
  mode: RemoveBackgroundMode;
  tolerance: number;
  keyColor: Rgba | null;
}

export const DEFAULT_REMOVE_BACKGROUND: RemoveBackgroundSettings = {
  enabled: false,
  mode: RemoveBackgroundMode.Auto,
  tolerance: DEFAULT_TOLERANCE,
  keyColor: null,
};

/** Euclidean RGB distance between a pixel and a key color. */
export function colorKeyDistance(
  r: number,
  g: number,
  b: number,
  key: readonly [number, number, number] | Rgba,
): number {
  const dr = r - key[0];
  const dg = g - key[1];
  const db = b - key[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Most common quantized border color (top/bottom/left/right edges). Matches the research
 * classical Auto key used on flat sprite backgrounds.
 */
export function modeBorderColor(image: PixelBuffer): Rgba {
  const { width, height, data } = image;
  const counts = new Map<number, number>();
  const bump = (x: number, y: number) => {
    const i = (y * width + x) * CHANNELS;
    if (data[i + 3] === 0) return;
    const qr = (Math.floor(data[i] / BORDER_QUANT) * BORDER_QUANT + (BORDER_QUANT >> 1)) & 255;
    const qg = (Math.floor(data[i + 1] / BORDER_QUANT) * BORDER_QUANT + (BORDER_QUANT >> 1)) & 255;
    const qb = (Math.floor(data[i + 2] / BORDER_QUANT) * BORDER_QUANT + (BORDER_QUANT >> 1)) & 255;
    const key = (qr << 16) | (qg << 8) | qb;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (let x = 0; x < width; x++) {
    bump(x, 0);
    if (height > 1) bump(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    bump(0, y);
    if (width > 1) bump(width - 1, y);
  }
  let bestKey = 0;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }
  if (bestCount < 0) return [0, 0, 0, 255];
  return [(bestKey >> 16) & 255, (bestKey >> 8) & 255, bestKey & 255, 255];
}

/**
 * Edge-seeded flood: candidates within tolerance of `key` that connect to the image border
 * become transparent. Enclosed subject holes (letter O, etc.) stay opaque.
 */
export function edgeSeededFloodAlpha(
  image: PixelBuffer,
  key: readonly [number, number, number] | Rgba,
  tolerance: number,
): Uint8Array {
  const { width, height, data } = image;
  const n = width * height;
  const alpha = new Uint8Array(n);
  alpha.fill(255);
  if (n === 0) return alpha;

  const candidate = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += CHANNELS) {
    if (data[p + 3] === 0) {
      candidate[i] = 1;
      continue;
    }
    if (colorKeyDistance(data[p], data[p + 1], data[p + 2], key) <= tolerance) candidate[i] = 1;
  }

  const stack = new Int32Array(n);
  let top = 0;
  const pushBorder = (i: number) => {
    if (!candidate[i] || alpha[i] === 0) return;
    alpha[i] = 0;
    stack[top++] = i;
  };
  for (let x = 0; x < width; x++) {
    pushBorder(x);
    if (height > 1) pushBorder((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    pushBorder(y * width);
    if (width > 1) pushBorder(y * width + (width - 1));
  }

  while (top > 0) {
    const i = stack[--top]!;
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) pushBorder(i - 1);
    if (x + 1 < width) pushBorder(i + 1);
    if (y > 0) pushBorder(i - width);
    if (y + 1 < height) pushBorder(i + width);
  }
  return alpha;
}

function scoreMask(alpha: Uint8Array, width: number, height: number, dist: Float32Array): number {
  const n = width * height;
  if (n === 0) return 0;
  let removed = 0;
  let borderClear = 0;
  let borderCount = 0;
  let centerKeep = 0;
  let centerCount = 0;
  let leftoverBg = 0;
  let holes = 0;
  const cy0 = (height / 4) | 0;
  const cy1 = ((3 * height) / 4) | 0;
  const cx0 = (width / 4) | 0;
  const cx1 = ((3 * width) / 4) | 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const clear = alpha[i] === 0;
      if (clear) removed++;
      const onBorder = y === 0 || y === height - 1 || x === 0 || x === width - 1;
      if (onBorder) {
        borderCount++;
        if (clear) borderClear++;
      }
      const inCenter = y >= cy0 && y < cy1 && x >= cx0 && x < cx1;
      if (inCenter) {
        centerCount++;
        if (!clear) centerKeep++;
        if (clear && dist[i]! > 40) holes++;
      }
      if (!clear && dist[i]! <= 18) leftoverBg++;
    }
  }
  const removedRatio = removed / n;
  const borderRatio = borderCount ? borderClear / borderCount : 0;
  const centerRatio = centerCount ? centerKeep / centerCount : 1;
  const leftoverRatio = leftoverBg / n;
  const holesRatio = centerCount ? holes / centerCount : 0;
  return (
    0.35 * borderRatio +
    0.35 * centerRatio +
    0.15 * Math.min(removedRatio / 0.45, 1) -
    0.25 * leftoverRatio -
    0.4 * holesRatio
  );
}

function distanceField(
  image: PixelBuffer,
  key: readonly [number, number, number] | Rgba,
): Float32Array {
  const { width, height, data } = image;
  const dist = new Float32Array(width * height);
  for (let i = 0, p = 0; i < dist.length; i++, p += CHANNELS) {
    if (data[p + 3] === 0) {
      dist[i] = 0;
      continue;
    }
    dist[i] = colorKeyDistance(data[p], data[p + 1], data[p + 2], key);
  }
  return dist;
}

/** Pick tolerance by scoring edge-flood masks (Auto path). */
export function adaptiveTolerance(
  image: PixelBuffer,
  key: readonly [number, number, number] | Rgba,
): number {
  const dist = distanceField(image, key);
  let bestTol: number = AUTO_TOLERANCES[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const tol of AUTO_TOLERANCES) {
    const alpha = edgeSeededFloodAlpha(image, key, tol);
    const score = scoreMask(alpha, image.width, image.height, dist);
    if (score > bestScore) {
      bestScore = score;
      bestTol = tol;
    }
  }
  return bestTol;
}

function applyAlpha(image: PixelBuffer, alpha: Uint8Array): PixelBuffer {
  const data = new Uint8ClampedArray(image.data);
  for (let i = 0, p = 3; i < alpha.length; i++, p += CHANNELS) {
    if (alpha[i] === 0) data[p] = 0;
  }
  return { width: image.width, height: image.height, data };
}

/**
 * Classical Track B remove-background: edge-seeded flood + color tolerance.
 * Auto samples the mode border color and chooses tolerance; Manual uses key + tolerance.
 */
export function removeBackground(
  image: PixelBuffer,
  options: RemoveBackgroundOptions = {},
): PixelBuffer {
  const mode = options.mode ?? RemoveBackgroundMode.Auto;
  const key: Rgba =
    mode === RemoveBackgroundMode.Manual && options.keyColor
      ? options.keyColor
      : modeBorderColor(image);
  const tolerance =
    mode === RemoveBackgroundMode.Auto
      ? adaptiveTolerance(image, key)
      : Number.isFinite(options.tolerance)
        ? Math.max(0, options.tolerance as number)
        : DEFAULT_TOLERANCE;
  return applyAlpha(image, edgeSeededFloodAlpha(image, key, tolerance));
}

/** Sample one pixel as an RGBA key for Manual mode (transparent pixels ignored by caller). */
export function sampleKeyColor(image: PixelBuffer, x: number, y: number): Rgba | null {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= image.width || py >= image.height) return null;
  const i = (py * image.width + px) * CHANNELS;
  const a = image.data[i + 3];
  if (a === 0) return null;
  return [image.data[i], image.data[i + 1], image.data[i + 2], 255];
}
