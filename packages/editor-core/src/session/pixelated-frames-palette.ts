import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import { PaletteQuantizationAlgorithm, quantizePalette } from "$/color";

export const MAX_PIXELATED_PROJECT_PALETTE_COLORS = 256;
const RGBA_CHANNELS = 4;

/**
 * Build a deterministic document palette spanning all pixelated frames.
 * Keeps every exact color when the union fits within `maxColors` (default 256),
 * and falls back to multi-frame quantization when unique colors exceed the cap.
 */
export function extractPixelatedFramesPalette(
  frames: readonly PixelBuffer[],
  maxColors = MAX_PIXELATED_PROJECT_PALETTE_COLORS,
): Rgba[] {
  const limit = Math.max(1, Math.min(MAX_PIXELATED_PROJECT_PALETTE_COLORS, Math.trunc(maxColors)));
  const exact = new Map<number, number>();
  let hasTransparent = false;
  let overflowed = false;

  for (const frame of frames) {
    const { data } = frame;
    for (let offset = 0; offset < data.length; offset += RGBA_CHANNELS) {
      const alpha = data[offset + 3];
      if (alpha === 0) hasTransparent = true;
      if (overflowed) {
        if (hasTransparent) break;
        continue;
      }
      const key =
        alpha === 0
          ? 0
          : ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | alpha) >>>
            0;
      const previous = exact.get(key);
      if (previous !== undefined) {
        exact.set(key, previous + 1);
      } else if (exact.size < limit) {
        exact.set(key, 1);
      } else {
        overflowed = true;
      }
      if (overflowed && hasTransparent) break;
    }
    if (overflowed && hasTransparent) break;
  }

  if (!overflowed && exact.size > 0) {
    return [...exact.entries()]
      .sort(([keyA, countA], [keyB, countB]) => countB - countA || keyA - keyB)
      .map(
        ([key]) =>
          [
            (key >>> 24) & UINT8_MAX,
            (key >>> 16) & UINT8_MAX,
            (key >>> 8) & UINT8_MAX,
            key & UINT8_MAX,
          ] as Rgba,
      );
  }

  return quantizePalette(
    frames,
    limit,
    true,
    PaletteQuantizationAlgorithm.Default,
    hasTransparent ? 0 : -1,
    0,
  );
}
