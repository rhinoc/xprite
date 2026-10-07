const RGBA_BYTES = 4;
const ALPHA_OFFSET = 3;

export function hasTransparentRgb(pixels: Uint8Array | Uint8ClampedArray): boolean {
  for (let at = 0; at < pixels.length; at += RGBA_BYTES)
    if (!pixels[at + ALPHA_OFFSET] && (pixels[at] || pixels[at + 1] || pixels[at + 2])) return true;
  return false;
}
