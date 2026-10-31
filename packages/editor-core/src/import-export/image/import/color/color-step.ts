import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";

const CHANNELS = 4;
/** `m / 255` for every whole channel difference m, as doubles and as float32. */
export const OPAQUE_STEPS = Float64Array.from({ length: UINT8_MAX + 1 }, (_, m) => m / UINT8_MAX);
export const OPAQUE_STEPS_32 = Float32Array.from(OPAQUE_STEPS);
/** Step code of a pair that is not opaque on both sides: its step is computed in full. */
export const TRANSLUCENT = UINT8_MAX + 1;

/**
 * The colour step (0..1) between two RGBA pixels: the largest premultiplied channel or alpha
 * difference.
 */
export function colorStep(data: Uint8ClampedArray, first: number, second: number): number {
  const a = data[first + 3] / UINT8_MAX,
    b = data[second + 3] / UINT8_MAX;
  let difference = Math.abs(a - b);
  for (let c = 0; c < CHANNELS - 1; c++)
    difference = Math.max(
      difference,
      Math.abs(data[first + c] * a - data[second + c] * b) / UINT8_MAX,
    );
  return difference;
}

/**
 * Every pixel's step to its right and lower neighbour, as codes: for two opaque pixels the step is
 * the largest channel difference m over 255 exactly, so m is kept; other pairs are marked
 * {@link TRANSLUCENT}. Tilt estimation and grid detection read the same image's pairs, so the last
 * image's codes are kept.
 */
export interface NeighbourSteps {
  image: PixelBuffer;
  /** Code of the step from pixel p to p + 1 (unused in the last column). */
  right: Uint16Array;
  /** Code of the step from pixel p to p + width (unused in the last row). */
  down: Uint16Array;
}
let last: NeighbourSteps | null = null;
export function neighbourSteps(image: PixelBuffer): NeighbourSteps {
  if (last?.image === image) return last;
  const { width, height, data } = image;
  const right = new Uint16Array(width * height),
    down = new Uint16Array(width * height);
  const code = (first: number, second: number) =>
    data[first + 3] === UINT8_MAX && data[second + 3] === UINT8_MAX
      ? Math.max(
          Math.abs(data[first] - data[second]),
          Math.abs(data[first + 1] - data[second + 1]),
          Math.abs(data[first + 2] - data[second + 2]),
        )
      : TRANSLUCENT;
  const below = width * CHANNELS;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let p = row; p < row + width - 1; p++)
      right[p] = code(p * CHANNELS, p * CHANNELS + CHANNELS);
    if (y + 1 < height)
      for (let p = row; p < row + width; p++) down[p] = code(p * CHANNELS, p * CHANNELS + below);
  }
  last = { image, right, down };
  return last;
}

/** Drop the kept codes once the image's edge analysis is done. */
export function releaseNeighbourSteps(image: PixelBuffer) {
  if (last?.image === image) last = null;
}
/** Drop the kept codes, whichever image they belong to. */
export function forgetNeighbourSteps() {
  last = null;
}

/** The step (a double, as {@link colorStep}) of the pair from pixel p to p + offset. */
export function stepOf(codes: Uint16Array, data: Uint8ClampedArray, p: number, offset: number) {
  const code = codes[p];
  return code < TRANSLUCENT
    ? OPAQUE_STEPS[code]
    : colorStep(data, p * CHANNELS, (p + offset) * CHANNELS);
}
/** The same step rounded to float32. */
export function step32Of(codes: Uint16Array, data: Uint8ClampedArray, p: number, offset: number) {
  const code = codes[p];
  return code < TRANSLUCENT
    ? OPAQUE_STEPS_32[code]
    : Math.fround(colorStep(data, p * CHANNELS, (p + offset) * CHANNELS));
}
