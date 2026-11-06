/**
 * Adapted from Pixel Art Lighter v3.5.22 by Red Hat Sprite, MIT.
 * Copyright (c) 2026 Red Hat Sprite. Full notice: LICENSES/pixel-art-lighter-MIT.txt.
 * https://www.moonfell-rpg.com/Pixel-Art-Lighter-v3.5.22.html
 */
import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { assertPixelBuffer } from "$/document/pixel-validation";

export enum NormalMapPreset {
  Architecture = "architecture",
  Character = "character",
  Object = "object",
  Terrain = "terrain",
}
export interface NormalMapOptions {
  preset: NormalMapPreset;
  shapeStrength: number;
  normalStrength: number;
  smoothing: number;
  facets: number;
  mergeOutlines: boolean;
  invertY: boolean;
}
const PERCENT = 100;
const RED_LUMINANCE = 0.2126;
const GREEN_LUMINANCE = 0.7152;
const BLUE_LUMINANCE = 0.0722;
const CONSTANT_LUMINANCE = 0.75;
const CENTER_SMOOTHING_WEIGHT = 2;
const AZIMUTH_STEP = Math.PI / 4;
const FACET_DIRECTION_STEP = Math.PI / 2;
const FRONT_FACET_KEY = 9;
const HEIGHT_PROFILES: Record<
  NormalMapPreset,
  { silhouette: number; cap: number; luminance: number }
> = {
  [NormalMapPreset.Architecture]: { silhouette: 0, cap: 16, luminance: 3.5 },
  [NormalMapPreset.Character]: { silhouette: 0.65, cap: 8, luminance: 1.2 },
  [NormalMapPreset.Object]: { silhouette: 0.65, cap: 16, luminance: 2.1 },
  [NormalMapPreset.Terrain]: { silhouette: 0.12, cap: 16, luminance: 4 },
};
const NORMAL_CHANNEL_SCALE = 127.5;
const LUMINANCE_EPSILON = 1e-5;
const OUTLINE_DARKNESS = 0.24;
const OUTLINE_INTERIOR_RATIO = 0.15;
const FRONT_FACING_LIMIT = 0.12;
const TILT_LOW = 0.3;
const TILT_MEDIUM = 0.6;
const TILT_HIGH = 0.85;
const TILT_LEVEL_LOW = 0.24;
const TILT_LEVEL_MEDIUM = 0.48;
const TILT_LEVEL_HIGH = 0.72;
const TILT_LEVEL_MAX = 0.9;
const ARCHITECTURE_TILT = 0.6;
const ARCHITECTURE_FLAT_LIMIT = 0.06;
const FACET_AREA_BASE = 180;
const FACET_AREA_SCALE = 1.1;
const FACET_TILT_LIMIT = 0.35;
const FACET_MIN_PIXELS = 16;
const FACET_MIN_RATIO = 0.16;
const FACET_DOT_LIMIT = 0.8;
const FACET_DOT_SCALE = 0.001;
const DIRECTION_EPSILON = 0.001;
const SPECKLE_MAX_PIXELS = 2;
export const NORMAL_MAP_LIMITS = Object.freeze({
  shapeStrength: 200,
  normalStrength: 300,
  smoothing: 6,
  facets: 100,
});
const PRESET_DEFAULTS: Record<
  NormalMapPreset,
  Pick<NormalMapOptions, "shapeStrength" | "smoothing" | "facets">
> = {
  [NormalMapPreset.Architecture]: { shapeStrength: 100, smoothing: 1, facets: 20 },
  [NormalMapPreset.Character]: { shapeStrength: 65, smoothing: 2, facets: 15 },
  [NormalMapPreset.Object]: { shapeStrength: 100, smoothing: 3, facets: 35 },
  [NormalMapPreset.Terrain]: { shapeStrength: 110, smoothing: 3, facets: 50 },
};
export function defaultNormalMapOptions(preset = NormalMapPreset.Object): NormalMapOptions {
  return {
    preset,
    ...PRESET_DEFAULTS[preset],
    normalStrength: PERCENT,
    mergeOutlines: true,
    invertY: false,
  };
}
export function normalizeNormalMapOptions(input: Partial<NormalMapOptions>): NormalMapOptions {
  const preset = Object.values(NormalMapPreset).includes(input.preset!)
    ? input.preset!
    : NormalMapPreset.Object;
  const result = defaultNormalMapOptions(preset);
  for (const key of ["shapeStrength", "normalStrength", "smoothing", "facets"] as const) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value))
      result[key] = Math.round(Math.max(0, Math.min(NORMAL_MAP_LIMITS[key], value)));
  }
  for (const key of ["mergeOutlines", "invertY"] as const)
    if (typeof input[key] === "boolean") result[key] = input[key];
  return result;
}

/** Cache source segmentation, silhouette distance and geometry between parameter edits. */
export function createNormalMapGenerator(albedo: PixelBuffer): {
  generate(input?: Partial<NormalMapOptions>): PixelBuffer;
} {
  assertPixelBuffer(albedo);
  const w = albedo.width,
    h = albedo.height,
    N = w * h,
    a = albedo.data.slice(),
    fg = new Uint8Array(N),
    lum = new Float32Array(N),
    labels = new Int32Array(N);
  labels.fill(-1);
  let lo = Infinity,
    hi = -Infinity;
  for (let i = 0; i < N; i++) {
    const k = i * 4;
    fg[i] = a[k + 3] > 0 ? 1 : 0;
    lum[i] =
      (RED_LUMINANCE * a[k] + GREEN_LUMINANCE * a[k + 1] + BLUE_LUMINANCE * a[k + 2]) / UINT8_MAX;
    if (fg[i]) {
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
  for (let i = 0; i < N; i++)
    if (fg[i] && labels[i] < 0) {
      let head = 0,
        tail = 1;
      queue[0] = i;
      const id = clusters.length,
        pixels = [],
        k = i * 4;
      labels[i] = id;
      while (head < tail) {
        const p = queue[head++];
        pixels.push(p);
        for (const n of adjacent(p))
          if (
            fg[n] &&
            labels[n] < 0 &&
            a[n * 4] === a[k] &&
            a[n * 4 + 1] === a[k + 1] &&
            a[n * 4 + 2] === a[k + 2]
          ) {
            labels[n] = id;
            queue[tail++] = n;
          }
      }
      clusters.push({ pixels, value: lum[i] });
    }
  const distance = new Float32Array(N);
  distance.fill(N);
  let head = 0,
    tail = 0;
  for (let i = 0; i < N; i++)
    if (
      fg[i] &&
      (i % w === 0 || i % w === w - 1 || i < w || i >= N - w || adjacent(i).some((n) => !fg[n]))
    ) {
      distance[i] = 1;
      queue[tail++] = i;
    }
  while (head < tail) {
    const p = queue[head++];
    for (const n of adjacent(p))
      if (fg[n] && distance[n] > distance[p] + 1) {
        distance[n] = distance[p] + 1;
        queue[tail++] = n;
      }
  }
  const range = hi - lo,
    normalized = (i: number) =>
      range > LUMINANCE_EPSILON ? (lum[i] - lo) / range : CONSTANT_LUMINANCE;
  const thin = new Uint8Array(N);
  for (const cluster of clusters) {
    if (cluster.value > lo + range * OUTLINE_DARKNESS) continue;
    let interior = 0;
    for (const p of cluster.pixels)
      if (adjacent(p).length === 4 && adjacent(p).every((n) => labels[n] === labels[p])) interior++;
    if (interior / cluster.pixels.length < OUTLINE_INTERIOR_RATIO)
      for (const p of cluster.pixels) thin[p] = 1;
  }

  let cachedFieldKey = "";
  let cachedField: Float32Array | null = null;
  let cachedKey = "";
  let cachedDirections: Float32Array | null = null;
  return {
    generate(input: Partial<NormalMapOptions> = {}): PixelBuffer {
      const options = normalizeNormalMapOptions(input);
      const key = JSON.stringify([
        options.preset,
        options.shapeStrength,
        options.smoothing,
        options.facets,
        options.mergeOutlines,
      ]);
      let directions = cachedDirections;
      if (!directions || cachedKey !== key) {
        const preset = options.preset;
        const profile = HEIGHT_PROFILES[preset];
        const scale = options.shapeStrength / PERCENT;
        const fieldKey = JSON.stringify([preset, options.smoothing]);
        let field = cachedField;
        if (!field || cachedFieldKey !== fieldKey) {
          let nextField = new Float32Array(N);
          for (let i = 0; i < N; i++)
            if (fg[i]) {
              const convex = Math.sqrt(Math.min(distance[i], profile.cap)) * profile.silhouette;
              nextField[i] = convex + normalized(i) * profile.luminance;
            }
          for (let pass = 0; pass < options.smoothing; pass++) {
            const blurred = new Float32Array(N);
            for (let i = 0; i < N; i++)
              if (fg[i]) {
                let sum = nextField[i] * CENTER_SMOOTHING_WEIGHT,
                  count = CENTER_SMOOTHING_WEIGHT;
                for (const n of adjacent(i))
                  if (fg[n]) {
                    sum += nextField[n];
                    count++;
                  }
                blurred[i] = sum / count;
              }
            nextField = blurred;
          }
          cachedFieldKey = fieldKey;
          field = cachedField = nextField;
        }
        const dirs = new Float32Array(N * 3);
        const unit = (v: number[]) => {
          const len = Math.hypot(...v) || 1;
          return v.map((n) => n / len);
        };
        const quantize = (v: number[]) => {
          v = unit(v);
          const tilt = Math.hypot(v[0], v[1]);
          if (tilt < FRONT_FACING_LIMIT) return [0, 0, 1];
          const angle = Math.round(Math.atan2(v[1], v[0]) / AZIMUTH_STEP) * AZIMUTH_STEP;
          const elevation =
            preset === NormalMapPreset.Architecture
              ? Math.min(TILT_LEVEL_MAX, ARCHITECTURE_TILT * scale)
              : tilt < TILT_LOW
                ? TILT_LEVEL_LOW
                : tilt < TILT_MEDIUM
                  ? TILT_LEVEL_MEDIUM
                  : tilt < TILT_HIGH
                    ? TILT_LEVEL_HIGH
                    : TILT_LEVEL_MAX;
          return [
            Math.cos(angle) * elevation,
            Math.sin(angle) * elevation,
            Math.sqrt(1 - elevation * elevation),
          ];
        };
        for (let i = 0; i < N; i++)
          if (fg[i]) {
            const x = i % w,
              y = (i / w) | 0,
              at = (n: number) => (n >= 0 && n < N && fg[n] ? field[n] : field[i]);
            const dx = (x < w - 1 ? at(i + 1) : field[i]) - (x ? at(i - 1) : field[i]),
              dy = (y < h - 1 ? at(i + w) : field[i]) - (y ? at(i - w) : field[i]);
            const normal = unit([-dx * scale, dy * scale, 1]);
            dirs.set(normal, i * 3);
          }
        for (const cluster of clusters) {
          let sum = [0, 0, 0];
          for (const p of cluster.pixels) {
            if (
              preset === NormalMapPreset.Architecture &&
              Math.hypot(dirs[p * 3], dirs[p * 3 + 1]) < ARCHITECTURE_FLAT_LIMIT
            )
              continue;
            for (let c = 0; c < 3; c++) sum[c] += dirs[p * 3 + c];
          }
          if (sum[2] === 0) sum = [0, 0, 1];
          const average = unit(sum),
            groups = new Map<number, number[]>();
          const split =
            options.facets > 0 &&
            cluster.pixels.length >=
              Math.round(FACET_AREA_BASE - options.facets * FACET_AREA_SCALE);
          if (split) {
            for (const p of cluster.pixels) {
              const dx = dirs[p * 3],
                dy = dirs[p * 3 + 1],
                tilt = Math.hypot(dx, dy);
              const key =
                tilt > FACET_TILT_LIMIT
                  ? Math.round(Math.atan2(dy, dx) / FACET_DIRECTION_STEP)
                  : FRONT_FACET_KEY;
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(p);
            }
          }
          const supported = [...groups.values()].filter(
            (g) => g.length >= Math.max(FACET_MIN_PIXELS, cluster.pixels.length * FACET_MIN_RATIO),
          );
          let allow = false;
          if (supported.length >= 2) {
            const means = supported.map((g) => {
              const s = [0, 0, 0];
              for (const p of g) for (let c = 0; c < 3; c++) s[c] += dirs[p * 3 + c];
              return unit(s);
            });
            for (let i = 0; i < means.length; i++)
              for (let j = 0; j < i; j++)
                if (
                  means[i].reduce((s, v, c) => s + v * means[j][c], 0) <
                  FACET_DOT_LIMIT - options.facets * FACET_DOT_SCALE
                )
                  allow = true;
          }
          const base = quantize(average);
          for (const p of cluster.pixels) dirs.set(base, p * 3);
          if (allow)
            for (const g of supported) {
              const sum = [0, 0, 0];
              for (const p of g) {
                const x = p % w,
                  y = (p / w) | 0,
                  at = (n: number) => (n >= 0 && n < N && fg[n] ? field[n] : field[p]);
                const dx = (x < w - 1 ? at(p + 1) : field[p]) - (x ? at(p - 1) : field[p]),
                  dy = (y < h - 1 ? at(p + w) : field[p]) - (y ? at(p - w) : field[p]);
                const v = unit([-dx * scale, dy * scale, 1]);
                for (let c = 0; c < 3; c++) sum[c] += v[c];
              }
              const v = quantize(sum);
              for (const p of g) dirs.set(v, p * 3);
            }
        }
        if (options.mergeOutlines) {
          const assigned = new Uint8Array(N);
          head = 0;
          tail = 0;
          for (let i = 0; i < N; i++)
            if (fg[i] && !thin[i]) {
              assigned[i] = 1;
              queue[tail++] = i;
            }
          while (head < tail) {
            const p = queue[head++];
            for (const n of adjacent(p))
              if (fg[n] && !assigned[n]) {
                assigned[n] = 1;
                dirs.set(dirs.subarray(p * 3, p * 3 + 3), n * 3);
                queue[tail++] = n;
              }
          }
        }
        const seen = new Uint8Array(N);
        for (let i = 0; i < N; i++)
          if (fg[i] && !seen[i]) {
            const group: number[] = [];
            head = 0;
            tail = 1;
            queue[0] = i;
            seen[i] = 1;
            while (head < tail) {
              const p = queue[head++];
              group.push(p);
              for (const n of adjacent(p))
                if (
                  fg[n] &&
                  !seen[n] &&
                  Math.abs(dirs[n * 3] - dirs[i * 3]) < DIRECTION_EPSILON &&
                  Math.abs(dirs[n * 3 + 1] - dirs[i * 3 + 1]) < DIRECTION_EPSILON
                ) {
                  seen[n] = 1;
                  queue[tail++] = n;
                }
            }
            if (group.length <= SPECKLE_MAX_PIXELS) {
              const neighbors = group.flatMap(adjacent).filter((n) => fg[n] && !group.includes(n));
              if (neighbors.length) {
                const n = neighbors[0];
                for (const p of group) dirs.set(dirs.subarray(n * 3, n * 3 + 3), p * 3);
              }
            }
          }

        cachedKey = key;
        directions = cachedDirections = dirs;
      }
      const output = new Uint8ClampedArray(N * 4);
      const gain = options.normalStrength / PERCENT;
      const ySign = options.invertY ? -1 : 1;
      for (let i = 0; i < N; i++) {
        const vector = i * 3,
          at = i * 4;
        const x = fg[i] ? directions[vector] * gain : 0;
        const y = fg[i] ? directions[vector + 1] * gain : 0;
        const z = fg[i] ? directions[vector + 2] : 1;
        const length = Math.sqrt(x * x + y * y + z * z) || 1;
        output[at] = Math.round((x / length + 1) * NORMAL_CHANNEL_SCALE);
        output[at + 1] = Math.round(((y / length) * ySign + 1) * NORMAL_CHANNEL_SCALE);
        output[at + 2] = Math.round((z / length + 1) * NORMAL_CHANNEL_SCALE);
        output[at + 3] = a[at + 3];
      }
      return { width: w, height: h, data: output };
    },
  };
}

export function generateNormalMap(
  albedo: PixelBuffer,
  input: Partial<NormalMapOptions> = {},
): PixelBuffer {
  return createNormalMapGenerator(albedo).generate(input);
}
