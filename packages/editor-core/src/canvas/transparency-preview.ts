import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { assertPixelBuffer } from "$/document/pixel-validation";

const DEFAULT_CHECKER_CELL_SIZE = 16;
const CHECKER_LIGHT = 192;
const CHECKER_DARK = 128;
const RGBA_CHANNELS = 4;
const RGB_CHANNELS = 3;
const ALPHA_CHANNEL = 3;

/** Composite a display-only checker in document pixels, anchored to (0, 0).
 * Scaling this raster samples checker and artwork together; exports retain
 * the unmodified RGBA source. */
export function compositeTransparencyPreview(
  source: PixelBuffer,
  cellSize = DEFAULT_CHECKER_CELL_SIZE,
): PixelBuffer {
  assertPixelBuffer(source);
  if (!Number.isSafeInteger(cellSize) || cellSize < 1)
    throw new RangeError("Checker cell size must be a positive integer.");
  const data = new Uint8ClampedArray(source.data.length);
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const offset = (y * source.width + x) * RGBA_CHANNELS;
      const background =
        (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 ? CHECKER_LIGHT : CHECKER_DARK;
      const alpha = source.data[offset + ALPHA_CHANNEL];
      for (let channel = 0; channel < RGB_CHANNELS; channel++) {
        data[offset + channel] = Math.round(
          (source.data[offset + channel] * alpha + background * (UINT8_MAX - alpha)) / UINT8_MAX,
        );
      }
      data[offset + ALPHA_CHANNEL] = UINT8_MAX;
    }
  }
  return { width: source.width, height: source.height, data };
}
