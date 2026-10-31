import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";

const CHANNELS = 4;
const COLOR_CHANNELS = 3;
const LUMA = [0.2126, 0.7152, 0.0722] as const;
const MIN_CONTRAST = 0.14;
const BACKGROUND_TOLERANCE = 0.12;
const MAX_BLEND = 0.65;
const PERCENT = 100;

/** Independent thin-ridge filter: opposite neighbors identify narrow light/dark features.
 * Only RGB is blended into existing visible pixels; the alpha footprint never grows. */
export function protectPixelationContours(image: PixelBuffer, strength: number): PixelBuffer {
  if (!strength) return image;
  const count = image.width * image.height;
  const luminance = new Float32Array(count);
  const features = new Float32Array(count);
  const source = image.data;
  for (let i = 0; i < count; i++) {
    const offset = i * CHANNELS;
    luminance[i] =
      (source[offset] * LUMA[0] + source[offset + 1] * LUMA[1] + source[offset + 2] * LUMA[2]) /
      UINT8_MAX;
  }
  const ridge = (center: number, first: number, second: number) => {
    if (!source[first * CHANNELS + COLOR_CHANNELS] || !source[second * CHANNELS + COLOR_CHANNELS])
      return 0;
    const left = luminance[center] - luminance[first],
      right = luminance[center] - luminance[second];
    if (left * right <= 0 || Math.abs(luminance[first] - luminance[second]) > BACKGROUND_TOLERANCE)
      return 0;
    return Math.min(Math.abs(left), Math.abs(right));
  };
  for (let y = 1; y < image.height - 1; y++)
    for (let x = 1; x < image.width - 1; x++) {
      const i = y * image.width + x;
      if (!source[i * CHANNELS + COLOR_CHANNELS]) continue;
      features[i] = Math.max(ridge(i, i - 1, i + 1), ridge(i, i - image.width, i + image.width));
    }
  const data = new Uint8ClampedArray(source);
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const i = y * image.width + x,
        offset = i * CHANNELS;
      if (!source[offset + COLOR_CHANNELS] || features[i] >= MIN_CONTRAST) continue;
      let best = i,
        score = MIN_CONTRAST;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue;
          const neighbor = ny * image.width + nx;
          const coverage = source[neighbor * CHANNELS + COLOR_CHANNELS] / UINT8_MAX;
          const candidate =
            (features[neighbor] * coverage) / Math.max(1, Math.abs(dx) + Math.abs(dy));
          if (candidate > score) {
            score = candidate;
            best = neighbor;
          }
        }
      if (best === i) continue;
      const amount = (strength / PERCENT) * MAX_BLEND;
      for (let c = 0; c < COLOR_CHANNELS; c++)
        data[offset + c] = Math.round(
          source[offset + c] * (1 - amount) + source[best * CHANNELS + c] * amount,
        );
    }
  return { width: image.width, height: image.height, data };
}
