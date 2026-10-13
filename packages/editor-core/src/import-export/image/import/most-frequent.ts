import { UINT8_MAX, type PixelBuffer } from "$/base";
import { assertDimension, assertPixelCount } from "$/document";

const CHANNELS = 4;
const RGB_BASE = 256;
const EMPTY_SAMPLE = -1;
const MAX_SAMPLES_PER_AXIS = 64;

/** Choose a cell's most frequent RGB, counting transparent pixels as empty samples. */
export function resizeMostFrequent(
  source: Readonly<PixelBuffer>,
  width: number,
  height: number,
): PixelBuffer {
  assertDimension(source.width, "source width");
  assertDimension(source.height, "source height");
  assertDimension(width, "width");
  assertDimension(height, "height");
  assertPixelCount(width, height);
  if (source.data.length !== source.width * source.height * CHANNELS)
    throw new Error("Invalid pixel buffer.");
  const data = new Uint8ClampedArray(width * height * CHANNELS);
  for (let row = 0; row < height; row++) {
    const top = Math.floor((row * source.height) / height);
    const bottom = Math.min(
      source.height,
      Math.max(top + 1, Math.floor(((row + 1) * source.height) / height)),
    );
    const yStep = Math.ceil((bottom - top) / MAX_SAMPLES_PER_AXIS);
    for (let column = 0; column < width; column++) {
      const left = Math.floor((column * source.width) / width);
      const right = Math.min(
        source.width,
        Math.max(left + 1, Math.floor(((column + 1) * source.width) / width)),
      );
      const xStep = Math.ceil((right - left) / MAX_SAMPLES_PER_AXIS);
      const counts = new Map<number, number>();
      let alphaSum = 0;
      let samples = 0;
      for (let y = top; y < bottom; y += yStep)
        for (let x = left; x < right; x += xStep) {
          const offset = (y * source.width + x) * CHANNELS;
          alphaSum += source.data[offset + 3];
          samples++;
          const key =
            source.data[offset + 3] === 0
              ? EMPTY_SAMPLE
              : (source.data[offset] * RGB_BASE + source.data[offset + 1]) * RGB_BASE +
                source.data[offset + 2];
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      let selected = EMPTY_SAMPLE;
      let largest = 0;
      for (const [color, count] of counts)
        if (count > largest) {
          selected = color;
          largest = count;
        }
      if (selected === EMPTY_SAMPLE) continue;
      const offset = (row * width + column) * CHANNELS;
      data[offset] = Math.floor(selected / (RGB_BASE * RGB_BASE));
      data[offset + 1] = Math.floor(selected / RGB_BASE) % RGB_BASE;
      data[offset + 2] = selected % RGB_BASE;
      data[offset + 3] = Math.min(UINT8_MAX, Math.round(alphaSum / samples));
    }
  }
  return { width, height, data };
}
