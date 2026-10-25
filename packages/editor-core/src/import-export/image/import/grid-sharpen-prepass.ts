import type { PixelBuffer } from "$/base/primitives";

/**
 * Unsharp mask for grid detection only: original + amount * (original - box blur). It restores
 * the edge contrast a soft upscale spread out, so the edge-projection detectors can propose a
 * grid on the sharpened copy. The cuts it yields are scored and recovered on the original.
 */
const CHANNELS = 4;
const SHARPEN_RADIUS = 2;
const SHARPEN_AMOUNT = 2.5;

/** Separable box blur of one plane, clamping at the borders. */
function boxBlurPlane(
  plane: Float64Array,
  width: number,
  height: number,
  radius: number,
): Float64Array {
  const across = new Float64Array(width * height);
  const out = new Float64Array(width * height);
  const span = 2 * radius + 1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let d = -radius; d <= radius; d++)
        sum += plane[y * width + Math.min(width - 1, Math.max(0, x + d))];
      across[y * width + x] = sum / span;
    }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let d = -radius; d <= radius; d++)
        sum += across[Math.min(height - 1, Math.max(0, y + d)) * width + x];
      out[y * width + x] = sum / span;
    }
  return out;
}

export function sharpenForGridDetect(
  image: PixelBuffer,
  radius = SHARPEN_RADIUS,
  amount = SHARPEN_AMOUNT,
): PixelBuffer {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray(data.length);
  const plane = new Float64Array(width * height);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < width * height; i++) plane[i] = data[i * CHANNELS + c];
    const blurred = boxBlurPlane(plane, width, height, radius);
    for (let i = 0; i < width * height; i++)
      out[i * CHANNELS + c] = plane[i] + amount * (plane[i] - blurred[i]);
  }
  for (let i = 0; i < width * height; i++) out[i * CHANNELS + 3] = data[i * CHANNELS + 3];
  return { width, height, data: out };
}
