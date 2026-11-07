import { UINT8_MAX, type PixelBuffer } from "$/base";
import { lightingMapLuminance } from "$/image-editing/lighting-map-source";

const RGBA_CHANNELS = 4;
const ALPHA_CHANNEL = 3;
const NEUTRAL_SHADING = 0.5;
const RADIUS_SCALE = 4;
const MIN_RADIUS = 2;
const MAX_RADIUS = 12;

/** Signed luminance relative to the surrounding foreground, independent of the light angle. */
export function paintedLightSignal(
  width: number,
  height: number,
  foreground: Uint8Array,
  foregroundArea: number,
  luminance: Float32Array,
  shading?: PixelBuffer,
): Float32Array {
  const radius = Math.min(
    MAX_RADIUS,
    Math.max(MIN_RADIUS, Math.round(Math.sqrt(foregroundArea) / RADIUS_SCALE)),
  );
  const rowSums = new Float32Array(foreground.length);
  const rowCounts = new Uint8Array(foreground.length);
  const signal = new Float32Array(foreground.length);
  const brightness = (pixel: number) => {
    if (!shading) return luminance[pixel];
    const at = pixel * RGBA_CHANNELS;
    const alpha = shading.data[at + ALPHA_CHANNEL] / UINT8_MAX;
    return NEUTRAL_SHADING + alpha * (lightingMapLuminance(shading.data, at) - NEUTRAL_SHADING);
  };

  for (let y = 0; y < height; y++) {
    const start = y * width;
    let sum = 0;
    let count = 0;
    for (let x = -radius; x < width; x++) {
      const next = x + radius;
      if (next < width && foreground[start + next]) {
        sum += brightness(start + next);
        count++;
      }
      const previous = x - radius - 1;
      if (previous >= 0 && foreground[start + previous]) {
        sum -= brightness(start + previous);
        count--;
      }
      if (x >= 0) {
        rowSums[start + x] = sum;
        rowCounts[start + x] = count;
      }
    }
  }

  for (let x = 0; x < width; x++) {
    let sum = 0;
    let count = 0;
    for (let y = -radius; y < height; y++) {
      const next = y + radius;
      if (next < height) {
        sum += rowSums[next * width + x];
        count += rowCounts[next * width + x];
      }
      const previous = y - radius - 1;
      if (previous >= 0) {
        sum -= rowSums[previous * width + x];
        count -= rowCounts[previous * width + x];
      }
      const pixel = y * width + x;
      if (y >= 0 && foreground[pixel] && count) signal[pixel] = brightness(pixel) - sum / count;
    }
  }
  return signal;
}
