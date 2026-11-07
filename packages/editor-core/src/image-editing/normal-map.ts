/**
 * Adapted from Pixel Art Lighter v3.5.22 by Red Hat Sprite, MIT.
 * Copyright (c) 2026 Red Hat Sprite. Full notice: LICENSES/pixel-art-lighter-MIT.txt.
 * https://www.moonfell-rpg.com/Pixel-Art-Lighter-v3.5.22.html
 */
import type { PixelBuffer } from "$/base/primitives";
import { assertPixelBuffer } from "$/document/pixel-validation";
import {
  CONSTANT_LUMINANCE,
  LightingMapRegionMode,
  LUMINANCE_EPSILON,
  segmentLightingMapSource,
} from "$/image-editing/lighting-map-source";
import { estimatePaintedLightAngle } from "$/image-editing/normal-map-light-estimate";
import { paintedLightSignal } from "$/image-editing/normal-map-painted-light";

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
  paintedLightAngle: number;
  paintedLightInfluence: number;
}
const PERCENT = 100;
const DEFAULT_PAINTED_LIGHT_ANGLE = 135;
const FULL_TURN_DEGREES = 360;
const RADIANS_PER_DEGREE = Math.PI / 180;
const PAINTED_LIGHT_TILT_GAIN = 3;
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
const FACET_REFERENCE_SIDE = 64;
const FACET_MAX_SPRITE_SCALE = 2;
const FACET_MIN_REGION_AREA = 8;
const FACET_TILT_LIMIT = 0.35;
const FACET_MIN_SUPPORT = 2;
const FACET_SUPPORT_BASE = 1.5;
const FACET_SUPPORT_RANGE = 0.75;
const FACET_DOT_LIMIT = 0.7;
const FACET_DOT_RANGE = 0.1;
const FACET_DIRECTION_COUNT = 4;
const DIRECTION_EPSILON = 0.001;
const SPECKLE_MAX_PIXELS = 2;
export const NORMAL_MAP_LIMITS = Object.freeze({
  shapeStrength: 200,
  normalStrength: 300,
  smoothing: 6,
  facets: 100,
  paintedLightAngle: FULL_TURN_DEGREES - 1,
  paintedLightInfluence: PERCENT,
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
    paintedLightAngle: DEFAULT_PAINTED_LIGHT_ANGLE,
    paintedLightInfluence: 0,
  };
}
export function normalizeNormalMapOptions(input: Partial<NormalMapOptions>): NormalMapOptions {
  const preset = Object.values(NormalMapPreset).includes(input.preset!)
    ? input.preset!
    : NormalMapPreset.Object;
  const result = defaultNormalMapOptions(preset);
  for (const key of Object.keys(NORMAL_MAP_LIMITS) as (keyof typeof NORMAL_MAP_LIMITS)[]) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value))
      result[key] = Math.round(Math.max(0, Math.min(NORMAL_MAP_LIMITS[key], value)));
  }
  for (const key of ["mergeOutlines", "invertY"] as const)
    if (typeof input[key] === "boolean") result[key] = input[key];
  return result;
}

/** Cache source segmentation, silhouette distance and geometry between parameter edits. */
export function createNormalMapGenerator(
  albedo: PixelBuffer,
  shading?: PixelBuffer,
): {
  setShading(source: PixelBuffer | null): void;
  suggestPaintedLightAngle(): number | null;
  generate(input?: Partial<NormalMapOptions>): PixelBuffer;
} {
  const { w, h, N, a, fg, lum, labels, lo, hi, adjacent, queue, clusters, foregroundArea } =
    segmentLightingMapSource(albedo, LightingMapRegionMode.Perceptual);
  const spriteScale = Math.min(
    FACET_MAX_SPRITE_SCALE,
    Math.sqrt(foregroundArea) / FACET_REFERENCE_SIDE,
  );
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
  let shadingSource: PixelBuffer | undefined;
  let lightSignal: Float32Array | undefined;
  let suggestedAngle: number | null | undefined;
  const setShading = (source: PixelBuffer | null) => {
    if (source) {
      assertPixelBuffer(source);
      if (source.width !== w || source.height !== h)
        throw new RangeError("Shading source must match the sprite dimensions");
    }
    shadingSource = source ? { ...source, data: source.data.slice() } : undefined;
    lightSignal = undefined;
    suggestedAngle = undefined;
    cachedKey = "";
  };
  if (shading) setShading(shading);
  return {
    setShading,
    suggestPaintedLightAngle() {
      if (suggestedAngle === undefined)
        suggestedAngle = estimatePaintedLightAngle({ width: w, height: h, data: a }, shadingSource);
      return suggestedAngle;
    },
    generate(input: Partial<NormalMapOptions> = {}): PixelBuffer {
      const options = normalizeNormalMapOptions(input);
      const influence = options.paintedLightInfluence / PERCENT;
      const key = JSON.stringify([
        options.preset,
        options.shapeStrength,
        options.smoothing,
        options.facets,
        options.mergeOutlines,
        influence,
        influence ? options.paintedLightAngle : 0,
      ]);
      let directions = cachedDirections;
      if (!directions || cachedKey !== key) {
        const preset = options.preset;
        const profile = HEIGHT_PROFILES[preset];
        const scale = options.shapeStrength / PERCENT;
        const fieldKey = JSON.stringify([preset, options.smoothing, influence]);
        let field = cachedField;
        if (!field || cachedFieldKey !== fieldKey) {
          let nextField = new Float32Array(N);
          for (let i = 0; i < N; i++)
            if (fg[i]) {
              const convex = Math.sqrt(Math.min(distance[i], profile.cap)) * profile.silhouette;
              nextField[i] = convex + normalized(i) * profile.luminance * (1 - influence);
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
        const heightField = field;
        if (influence)
          lightSignal ??= paintedLightSignal(w, h, fg, foregroundArea, lum, shadingSource);
        const angle = options.paintedLightAngle * RADIANS_PER_DEGREE;
        const lightX = Math.cos(angle) * influence * PAINTED_LIGHT_TILT_GAIN;
        const lightY = Math.sin(angle) * influence * PAINTED_LIGHT_TILT_GAIN;
        const normalAt = (pixel: number) => {
          const x = pixel % w;
          const y = (pixel / w) | 0;
          const center = heightField[pixel];
          const at = (neighbor: number) => (fg[neighbor] ? heightField[neighbor] : center);
          const dx = (x < w - 1 ? at(pixel + 1) : center) - (x ? at(pixel - 1) : center);
          const dy = (y < h - 1 ? at(pixel + w) : center) - (y ? at(pixel - w) : center);
          if (!influence) return unit([-dx * scale, dy * scale, 1]);
          const tilt = lightSignal![pixel];
          return unit([-dx * scale + lightX * tilt, dy * scale + lightY * tilt, 1]);
        };
        for (let i = 0; i < N; i++) if (fg[i]) dirs.set(normalAt(i), i * 3);
        const facetStrength = options.facets / PERCENT;
        // Size eligibility by the occupied footprint, then size each candidate by its own region.
        const minFacetArea = Math.max(
          FACET_MIN_REGION_AREA,
          Math.round((FACET_AREA_BASE - options.facets * FACET_AREA_SCALE) * spriteScale),
        );
        const facetSupportFactor = FACET_SUPPORT_BASE - facetStrength * FACET_SUPPORT_RANGE;
        const facetDotLimit = FACET_DOT_LIMIT + facetStrength * FACET_DOT_RANGE;
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
          const split = options.facets > 0 && cluster.pixels.length >= minFacetArea;
          if (split) {
            for (const p of cluster.pixels) {
              const dx = dirs[p * 3],
                dy = dirs[p * 3 + 1],
                tilt = Math.hypot(dx, dy);
              const key =
                tilt > FACET_TILT_LIMIT
                  ? (Math.round(Math.atan2(dy, dx) / FACET_DIRECTION_STEP) +
                      FACET_DIRECTION_COUNT) %
                    FACET_DIRECTION_COUNT
                  : FRONT_FACET_KEY;
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(p);
            }
          }
          const minSupport = Math.max(
            FACET_MIN_SUPPORT,
            Math.ceil(Math.sqrt(cluster.pixels.length) * facetSupportFactor),
          );
          const supported = [...groups.values()].filter((group) => group.length >= minSupport);
          let allow = false;
          if (supported.length >= 2) {
            const means = supported.map((g) => {
              const s = [0, 0, 0];
              for (const p of g) for (let c = 0; c < 3; c++) s[c] += dirs[p * 3 + c];
              return unit(s);
            });
            for (let i = 0; i < means.length; i++)
              for (let j = 0; j < i; j++)
                if (means[i].reduce((s, v, c) => s + v * means[j][c], 0) < facetDotLimit)
                  allow = true;
          }
          const base = quantize(average);
          for (const p of cluster.pixels) dirs.set(base, p * 3);
          if (allow)
            for (const g of supported) {
              const sum = [0, 0, 0];
              for (const p of g) {
                const v = normalAt(p);
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
                  labels[n] === labels[i] &&
                  !seen[n] &&
                  Math.abs(dirs[n * 3] - dirs[i * 3]) < DIRECTION_EPSILON &&
                  Math.abs(dirs[n * 3 + 1] - dirs[i * 3 + 1]) < DIRECTION_EPSILON
                ) {
                  seen[n] = 1;
                  queue[tail++] = n;
                }
            }
            if (group.length <= SPECKLE_MAX_PIXELS) {
              const neighbors = group
                .flatMap(adjacent)
                .filter((n) => labels[n] === labels[i] && !group.includes(n));
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
