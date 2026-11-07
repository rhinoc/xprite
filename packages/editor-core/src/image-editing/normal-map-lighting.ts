import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Point, Rgba } from "$/base/primitives";
import { assertPixelBuffer } from "$/document/pixel-validation";
import { lightingMapLuminance } from "$/image-editing/lighting-map-source";

export interface NormalMapLightOptions {
  position: Point;
  height: number;
  brightness: number;
  ambient: number;
  maskStrength: number;
  color: Rgba;
  invertY: boolean;
}
const DEFAULT_LIGHT_HEIGHT = 25;
const DEFAULT_LIGHT_BRIGHTNESS = 250;
const DEFAULT_AMBIENT = 15;
const PERCENT = 100;
const DEFAULT_MASK_STRENGTH = PERCENT;
const MIN_DISTANCE = 0.000001;
const LIGHT_RADIUS_FACTOR = 0.75;
const SRGB_DECODE_LIMIT = 0.04045;
const SRGB_ENCODE_LIMIT = 0.0031308;
const SRGB_LINEAR_FACTOR = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_GAMMA = 2.4;
export const NORMAL_LIGHT_LIMITS = Object.freeze({
  height: 600,
  brightness: 500,
  ambient: PERCENT,
  maskStrength: PERCENT,
});

export function defaultNormalMapLightOptions(width: number, height: number): NormalMapLightOptions {
  return {
    position: { x: width / 2, y: height / 2 },
    height: DEFAULT_LIGHT_HEIGHT,
    brightness: DEFAULT_LIGHT_BRIGHTNESS,
    ambient: DEFAULT_AMBIENT,
    maskStrength: DEFAULT_MASK_STRENGTH,
    color: [UINT8_MAX, UINT8_MAX, UINT8_MAX, UINT8_MAX],
    invertY: false,
  };
}

const linear = (value: number) => {
  const channel = value / UINT8_MAX;
  return channel <= SRGB_DECODE_LIMIT
    ? channel / SRGB_LINEAR_FACTOR
    : ((channel + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
};
const encoded = (value: number) =>
  Math.round(
    UINT8_MAX *
      Math.max(
        0,
        Math.min(
          1,
          value <= SRGB_ENCODE_LIMIT
            ? value * SRGB_LINEAR_FACTOR
            : SRGB_SCALE * value ** (1 / SRGB_GAMMA) - SRGB_OFFSET,
        ),
      ),
  );

export interface PreparedNormalMapLighting {
  readonly width: number;
  readonly height: number;
  readonly colors: Float32Array;
  readonly directions: Float32Array;
  readonly alpha: Uint8Array;
  readonly mask: Float32Array | null;
}
const LINEAR_CHANNELS = Float32Array.from({ length: UINT8_MAX + 1 }, (_, value) => linear(value));

/** Decode invariant color and vector data once for repeated light positions. */
export function prepareNormalMapLighting(
  albedo: PixelBuffer,
  normals: PixelBuffer | null,
  lightMask: PixelBuffer | null = null,
): PreparedNormalMapLighting {
  assertPixelBuffer(albedo);
  if (normals) {
    assertPixelBuffer(normals);
    if (normals.width !== albedo.width || normals.height !== albedo.height)
      throw new RangeError("Normal map dimensions must match the sprite");
  }
  if (lightMask) {
    assertPixelBuffer(lightMask);
    if (lightMask.width !== albedo.width || lightMask.height !== albedo.height)
      throw new RangeError("Light mask dimensions must match the sprite");
  }
  const count = albedo.width * albedo.height;
  const colors = new Float32Array(count * 3);
  const directions = new Float32Array(count * 3);
  const alpha = new Uint8Array(count);
  const mask = lightMask ? new Float32Array(count) : null;
  for (let i = 0; i < count; i++) {
    const at = i * 4,
      vector = i * 3;
    alpha[i] = albedo.data[at + 3];
    if (mask && lightMask) {
      const coverage = lightMask.data[at + 3] / UINT8_MAX;
      mask[i] = 1 - coverage * (1 - lightingMapLuminance(lightMask.data, at));
    }
    for (let c = 0; c < 3; c++) colors[vector + c] = LINEAR_CHANNELS[albedo.data[at + c]];
    const valid = normals && normals.data[at + 3] > 0;
    const nx = valid ? (normals.data[at] / UINT8_MAX) * 2 - 1 : 0;
    const ny = valid ? (normals.data[at + 1] / UINT8_MAX) * 2 - 1 : 0;
    const nz = valid ? (normals.data[at + 2] / UINT8_MAX) * 2 - 1 : 1;
    const length = Math.hypot(nx, ny, nz) || 1;
    directions[vector] = nx / length;
    directions[vector + 1] = ny / length;
    directions[vector + 2] = nz / length;
  }
  return { width: albedo.width, height: albedo.height, colors, directions, alpha, mask };
}

/** Lambert point lighting in linear color; normal channels are raw vector data. */
export function renderPreparedNormalMapLighting(
  source: PreparedNormalMapLighting,
  options: NormalMapLightOptions,
): PixelBuffer {
  const limit = (value: number, max: number, fallback: number) =>
    Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;
  const height = Math.max(
    MIN_DISTANCE,
    limit(options.height, NORMAL_LIGHT_LIMITS.height, DEFAULT_LIGHT_HEIGHT),
  );
  const power =
    limit(options.brightness, NORMAL_LIGHT_LIMITS.brightness, DEFAULT_LIGHT_BRIGHTNESS) / PERCENT;
  const ambient = limit(options.ambient, NORMAL_LIGHT_LIMITS.ambient, DEFAULT_AMBIENT) / PERCENT;
  const maskStrength =
    limit(options.maskStrength, NORMAL_LIGHT_LIMITS.maskStrength, DEFAULT_MASK_STRENGTH) / PERCENT;
  const light = options.color.map(linear);
  const radius = Math.max(1, Math.max(source.width, source.height) * LIGHT_RADIUS_FACTOR);
  const x = Number.isFinite(options.position.x) ? options.position.x : source.width / 2;
  const y = Number.isFinite(options.position.y) ? options.position.y : source.height / 2;
  const ySign = options.invertY ? -1 : 1;
  const data = new Uint8ClampedArray(source.width * source.height * 4);
  for (let i = 0; i < source.alpha.length; i++) {
    const at = i * 4,
      vector = i * 3;
    data[at + 3] = source.alpha[i];
    if (!source.alpha[i]) continue;
    const dx = x - (i % source.width);
    const dy = Math.floor(i / source.width) - y;
    const distanceSquared = dx * dx + dy * dy + height * height;
    const diffuse = Math.max(
      0,
      (source.directions[vector] * dx +
        source.directions[vector + 1] * dy * ySign +
        source.directions[vector + 2] * height) /
        Math.sqrt(distanceSquared),
    );
    const reception = source.mask ? 1 - maskStrength * (1 - source.mask[i]) : 1;
    const direct = (power * diffuse * reception) / (1 + distanceSquared / (radius * radius));
    for (let channel = 0; channel < 3; channel++)
      data[at + channel] = encoded(
        source.colors[vector + channel] * (ambient + direct * light[channel]),
      );
  }
  return { width: source.width, height: source.height, data };
}

export function renderNormalMapLighting(
  albedo: PixelBuffer,
  normals: PixelBuffer | null,
  options: NormalMapLightOptions,
  lightMask: PixelBuffer | null = null,
): PixelBuffer {
  return renderPreparedNormalMapLighting(
    prepareNormalMapLighting(albedo, normals, lightMask),
    options,
  );
}
