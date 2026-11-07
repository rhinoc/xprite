/**
 * Adapted from Pixel Art Lighter v3.5.22 by Red Hat Sprite, MIT.
 * Copyright (c) 2026 Red Hat Sprite. Full notice: LICENSES/pixel-art-lighter-MIT.txt.
 * https://www.moonfell-rpg.com/Pixel-Art-Lighter-v3.5.22.html
 */
import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import {
  CONSTANT_LUMINANCE,
  LUMINANCE_EPSILON,
  segmentLightingMapSource,
} from "$/image-editing/lighting-map-source";

export const DEFAULT_LIGHT_MASK_LAYER_NAME = "Light Mask";
export interface LightMaskOptions {
  strength: number;
  floor: number;
  ceiling: number;
  cavity: number;
}
const PERCENT = 100;
const SHADING_CURVE = 1.15;
const CAVITY_LUMINANCE_LIMIT = 0.35;
const CAVITY_NEIGHBOR_CONTRAST = 0.15;
const CAVITY_NEIGHBOR_MAJORITY = 0.5;
export const LIGHT_MASK_LIMITS = Object.freeze({
  strength: PERCENT,
  floor: UINT8_MAX,
  ceiling: UINT8_MAX,
  cavity: PERCENT,
});

export function defaultLightMaskOptions(): LightMaskOptions {
  return { strength: PERCENT, floor: 20, ceiling: UINT8_MAX, cavity: 35 };
}

export function createLightMaskGenerator(albedo: PixelBuffer) {
  const { w, h, a, fg, lum, labels, lo, hi, adjacent, clusters } = segmentLightingMapSource(albedo);
  const range = hi - lo;
  const regions = clusters.map(({ pixels, value }) => {
    const tone = range > LUMINANCE_EPSILON ? (value - lo) / range : CONSTANT_LUMINANCE;
    let surrounded = 0;
    if (tone < CAVITY_LUMINANCE_LIMIT) {
      for (const pixel of pixels) {
        let brighter = 0;
        let neighbors = 0;
        for (const neighbor of adjacent(pixel)) {
          if (!fg[neighbor] || labels[neighbor] === labels[pixel]) continue;
          neighbors++;
          if (lum[neighbor] > value + range * CAVITY_NEIGHBOR_CONTRAST) brighter++;
        }
        if (neighbors && brighter / neighbors > CAVITY_NEIGHBOR_MAJORITY) surrounded++;
      }
    }
    return {
      pixels,
      reception: tone ** SHADING_CURVE,
      cavity: Math.min(1, surrounded / Math.sqrt(pixels.length)),
    };
  });
  return {
    generate(input: Partial<LightMaskOptions> = {}): PixelBuffer {
      const options = defaultLightMaskOptions();
      for (const key of ["strength", "floor", "ceiling", "cavity"] as const) {
        const value = input[key];
        if (typeof value === "number" && Number.isFinite(value))
          options[key] = Math.round(Math.max(0, Math.min(LIGHT_MASK_LIMITS[key], value)));
      }
      const strength = options.strength / PERCENT;
      const floor = options.floor / UINT8_MAX;
      const cavity = options.cavity / PERCENT;
      const ceiling = options.ceiling / UINT8_MAX;
      const data = new Uint8ClampedArray(a.length);
      for (const region of regions) {
        const reception = (floor + (1 - floor) * region.reception) * (1 - cavity * region.cavity);
        const value = Math.round(
          UINT8_MAX * Math.min(ceiling, 1 - strength + strength * reception),
        );
        for (const pixel of region.pixels) {
          const at = pixel * 4;
          data[at] = data[at + 1] = data[at + 2] = value;
          data[at + 3] = a[at + 3];
        }
      }
      return { width: w, height: h, data };
    },
  };
}
