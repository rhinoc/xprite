import type { PixelBuffer } from "$/base/primitives";

const CHANNELS = 4;
const COLOR_CHANNELS = 3;
const SIMILARITY_LIMIT = 36;
const CENTER_WEIGHT = 2;
/** Light edge-preserving smoothing on the working grid; opacity and contrasting details stay intact. */
export function smoothPixelation(image: PixelBuffer): PixelBuffer {
  const data = new Uint8ClampedArray(image.data);
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const offset = (y * image.width + x) * CHANNELS;
      if (!image.data[offset + COLOR_CHANNELS]) continue;
      const sums = [0, 0, 0];
      let total = CENTER_WEIGHT;
      for (let channel = 0; channel < COLOR_CHANNELS; channel++)
        sums[channel] = image.data[offset + channel] * CENTER_WEIGHT;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue;
          const neighbor = (ny * image.width + nx) * CHANNELS;
          let distance = 0;
          for (let channel = 0; channel < CHANNELS; channel++)
            distance = Math.max(
              distance,
              Math.abs(image.data[offset + channel] - image.data[neighbor + channel]),
            );
          if (distance >= SIMILARITY_LIMIT) continue;
          const weight = 1 - distance / SIMILARITY_LIMIT;
          total += weight;
          for (let channel = 0; channel < COLOR_CHANNELS; channel++)
            sums[channel] += image.data[neighbor + channel] * weight;
        }
      for (let channel = 0; channel < COLOR_CHANNELS; channel++)
        data[offset + channel] = Math.round(sums[channel] / total);
    }
  return { ...image, data };
}
