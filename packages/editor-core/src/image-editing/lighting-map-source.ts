/**
 * Adapted from Pixel Art Lighter v3.5.22 by Red Hat Sprite, MIT.
 * Copyright (c) 2026 Red Hat Sprite. Full notice: LICENSES/pixel-art-lighter-MIT.txt.
 * https://www.moonfell-rpg.com/Pixel-Art-Lighter-v3.5.22.html
 */
import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { rgbToLab, type Lab } from "$/color";
import { assertPixelBuffer } from "$/document/pixel-validation";

const RED_LUMINANCE = 0.2126;
const GREEN_LUMINANCE = 0.7152;
const BLUE_LUMINANCE = 0.0722;
export const CONSTANT_LUMINANCE = 0.75;
export const LUMINANCE_EPSILON = 1e-5;
const RGBA_CHANNELS = 4;
const ALPHA_CHANNEL = 3;
const UNASSIGNED = -1;
const REGION_DELTA_E = 10;
const EDGE_DELTA_E = 6;
const EDGE_ALPHA_STEP = 48;
const RED_SHIFT = 16;
const GREEN_SHIFT = 8;
const MAX_CACHED_LAB_COLORS = 4096;

export enum LightingMapRegionMode {
  ExactRgb = "exact-rgb",
  Perceptual = "perceptual",
}

export function lightingMapLuminance(data: Uint8ClampedArray, at: number): number {
  return (
    (RED_LUMINANCE * data[at] + GREEN_LUMINANCE * data[at + 1] + BLUE_LUMINANCE * data[at + 2]) /
    UINT8_MAX
  );
}

/** Grow across weak edges while keeping every accepted color close to the region seed. */
function perceptualRegionGrowth(data: Uint8ClampedArray) {
  // Keep scratch memory bounded even when a sprite has a large transparent margin.
  const colors = new Map<number, Lab>();
  const rgb = (pixel: number) => {
    const at = pixel * RGBA_CHANNELS;
    return (data[at] << RED_SHIFT) | (data[at + 1] << GREEN_SHIFT) | data[at + 2];
  };
  const lab = (color: number) => {
    const cached = colors.get(color);
    if (cached) return cached;
    const value = rgbToLab(
      color >>> RED_SHIFT,
      (color >>> GREEN_SHIFT) & UINT8_MAX,
      color & UINT8_MAX,
    );
    if (colors.size === MAX_CACHED_LAB_COLORS) colors.clear();
    colors.set(color, value);
    return value;
  };
  const distanceSquared = (first: number, second: number) => {
    if (first === second) return 0;
    const a = lab(first);
    const b = lab(second);
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  };
  const alpha = (pixel: number) => data[pixel * RGBA_CHANNELS + ALPHA_CHANNEL];
  return (seed: number, pixel: number, neighbor: number) => {
    if (Math.abs(alpha(pixel) - alpha(neighbor)) >= EDGE_ALPHA_STEP) return false;
    const neighborColor = rgb(neighbor);
    return (
      distanceSquared(rgb(pixel), neighborColor) <= EDGE_DELTA_E ** 2 &&
      distanceSquared(rgb(seed), neighborColor) <= REGION_DELTA_E ** 2
    );
  };
}

/** Partition foreground pixels into four-connected regions. */
export function segmentLightingMapSource(
  albedo: PixelBuffer,
  mode = LightingMapRegionMode.ExactRgb,
) {
  assertPixelBuffer(albedo);
  const w = albedo.width,
    h = albedo.height,
    N = w * h,
    a = albedo.data.slice(),
    fg = new Uint8Array(N),
    lum = new Float32Array(N),
    labels = new Int32Array(N);
  labels.fill(UNASSIGNED);
  let foregroundArea = 0;
  let lo = Infinity,
    hi = -Infinity;
  for (let i = 0; i < N; i++) {
    const k = i * 4;
    fg[i] = a[k + 3] > 0 ? 1 : 0;
    lum[i] = lightingMapLuminance(a, k);
    if (fg[i]) {
      foregroundArea++;
      lo = Math.min(lo, lum[i]);
      hi = Math.max(hi, lum[i]);
    }
  }
  const adjacent = (i: number) => {
    const x = i % w,
      y = (i / w) | 0,
      out = [];
    if (x) out.push(i - 1);
    if (x < w - 1) out.push(i + 1);
    if (y) out.push(i - w);
    if (y < h - 1) out.push(i + w);
    return out;
  };
  const queue = new Int32Array(N),
    clusters: { pixels: number[]; value: number }[] = [];
  const perceptual = mode === LightingMapRegionMode.Perceptual;
  const canGrow = perceptual
    ? perceptualRegionGrowth(a)
    : (seed: number, _pixel: number, neighbor: number) => {
        const from = seed * RGBA_CHANNELS;
        const to = neighbor * RGBA_CHANNELS;
        return a[from] === a[to] && a[from + 1] === a[to + 1] && a[from + 2] === a[to + 2];
      };
  for (let i = 0; i < N; i++)
    if (fg[i] && labels[i] === UNASSIGNED) {
      let head = 0,
        tail = 1;
      queue[0] = i;
      const id = clusters.length,
        pixels = [];
      let luminanceSum = 0;
      labels[i] = id;
      while (head < tail) {
        const p = queue[head++];
        pixels.push(p);
        luminanceSum += lum[p];
        for (const n of adjacent(p))
          if (fg[n] && labels[n] === UNASSIGNED && canGrow(i, p, n)) {
            labels[n] = id;
            queue[tail++] = n;
          }
      }
      clusters.push({ pixels, value: perceptual ? luminanceSum / pixels.length : lum[i] });
    }
  return { w, h, N, a, fg, lum, labels, lo, hi, adjacent, queue, clusters, foregroundArea };
}
