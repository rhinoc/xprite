import type { PixelBuffer } from "$/base";

export interface ExportAttribution {
  readonly name: string;
  readonly url: string;
  readonly signature: PixelBuffer;
}

export interface ExportRasterText {
  measure(value: string, size: number): { width: number; height: number };
  draw(
    target: PixelBuffer,
    value: string,
    x: number,
    y: number,
    size: number,
    rgb: readonly number[],
  ): void;
}

const CHANNELS = 4;
const OPAQUE = 255;

/** Opaque horizontal runs over white paper, shared by raster and vector exports. */
export function exportImageRuns(
  image: PixelBuffer,
  draw: (x: number, y: number, width: number, rgb: readonly [number, number, number]) => void,
): void {
  const rgbAt = (x: number, y: number): [number, number, number] => {
    const offset = (y * image.width + x) * CHANNELS;
    const alpha = image.data[offset + 3] / OPAQUE;
    return [0, 1, 2].map((channel) =>
      Math.round(image.data[offset + channel] * alpha + OPAQUE * (1 - alpha)),
    ) as [number, number, number];
  };
  for (let y = 0; y < image.height; y++) {
    let start = 0;
    let rgb = rgbAt(start, y);
    for (let x = 1; x <= image.width; x++) {
      const next = x < image.width ? rgbAt(x, y) : null;
      if (next && next.every((channel, index) => channel === rgb[index])) continue;
      if (rgb.some((channel) => channel !== OPAQUE)) draw(start, y, x - start, rgb);
      if (next) rgb = next;
      start = x;
    }
  }
}
