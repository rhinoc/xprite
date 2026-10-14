interface RasterPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const FONT_FAMILY = "Arial, Helvetica, sans-serif";
const HEADING_SIZE = 24;
const TEXT_PADDING = 2;
const CHANNELS = 4;
const OPAQUE = 255;

export function artifactTextPixels(value: string, size: number): RasterPixels {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Artifact text rendering is unavailable.");
  const font = `${size >= HEADING_SIZE ? 600 : 400} ${size}px ${FONT_FAMILY}`;
  context.font = font;
  const metrics = context.measureText(value);
  const ascent = Math.ceil(metrics.actualBoundingBoxAscent);
  const descent = Math.ceil(metrics.actualBoundingBoxDescent);
  canvas.width = Math.max(
    1,
    Math.ceil(metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) + TEXT_PADDING * 2,
  );
  canvas.height = Math.max(1, ascent + descent + TEXT_PADDING * 2);
  context.font = font;
  context.fillText(value, TEXT_PADDING + metrics.actualBoundingBoxLeft, TEXT_PADDING + ascent);
  return {
    width: canvas.width,
    height: canvas.height,
    data: context.getImageData(0, 0, canvas.width, canvas.height).data,
  };
}

/** Conventional text rendered at its final PNG resolution, with cached ink masks. */
export function createArtifactRasterText() {
  const cache = new Map<string, RasterPixels>();
  const pixels = (value: string, size: number) => {
    const key = `${size}:${value}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const image = artifactTextPixels(value, size);
    cache.set(key, image);
    return image;
  };
  return {
    measure(value: string, size: number) {
      const image = pixels(value, size);
      return { width: image.width, height: image.height };
    },
    draw(
      target: RasterPixels,
      value: string,
      x: number,
      y: number,
      size: number,
      rgb: readonly number[],
    ) {
      const image = pixels(value, size);
      for (let row = 0; row < image.height; row++)
        for (let column = 0; column < image.width; column++) {
          const px = Math.round(x) + column,
            py = Math.round(y) + row;
          if (px < 0 || py < 0 || px >= target.width || py >= target.height) continue;
          const alpha = image.data[(row * image.width + column) * CHANNELS + 3] / OPAQUE;
          if (!alpha) continue;
          const offset = (py * target.width + px) * CHANNELS;
          for (let channel = 0; channel < 3; channel++)
            target.data[offset + channel] = Math.round(
              rgb[channel] * alpha + target.data[offset + channel] * (1 - alpha),
            );
        }
    },
  };
}
