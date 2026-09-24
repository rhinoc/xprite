import { paintingCrosshairPixels } from "$/adapters/input/editor-cursors";
import type { PaintingCursorOptions, PaintingCursorRenderer } from "$/managers/ports/platform";

const CURSOR_SIDE = 7;
const CURSOR_CENTER = 3;
const CENTER_DOT_COLOR_BIT = 8;
const PNG_MIME_TYPE = "image/png";

/** Keep decoded raster images alive while the browser uses their native cursors. */
export function createPaintingCursorRenderer(): PaintingCursorRenderer {
  const cache = new Map<string, { image: HTMLImageElement; ready: Promise<string> }>();
  const surface = document.createElement("canvas");
  const context = surface.getContext("2d");
  let disposed = false;
  return {
    prepare(options: PaintingCursorOptions) {
      if (disposed || !context) return Promise.reject(new Error("Painting cursor unavailable"));
      const { scale, crosshair, centerDot, whiteBits, color } = options;
      const key = `${scale}:${crosshair}:${centerDot}:${whiteBits}:${color ?? "negative"}`;
      const cached = cache.get(key);
      if (cached) return cached.ready;
      const side = crosshair ? CURSOR_SIDE : 1;
      const hotspot = crosshair ? CURSOR_CENTER * scale : 0;
      surface.width = side * scale;
      surface.height = side * scale;
      const mark = (x: number, y: number, bit: number) => {
        context.fillStyle = color ?? (whiteBits & (1 << bit) ? "white" : "black");
        context.fillRect(x * scale, y * scale, scale, scale);
      };
      if (crosshair) paintingCrosshairPixels.forEach(([x, y], bit) => mark(x, y, bit));
      if (centerDot)
        mark(crosshair ? CURSOR_CENTER : 0, crosshair ? CURSOR_CENTER : 0, CENTER_DOT_COLOR_BIT);
      const source = surface.toDataURL(PNG_MIME_TYPE);
      const image = new Image();
      image.src = source;
      const ready = image.decode().then(() => `url("${source}") ${hotspot} ${hotspot}, crosshair`);
      cache.set(key, { image, ready });
      return ready;
    },
    dispose() {
      disposed = true;
      for (const { image } of cache.values()) image.src = "";
      cache.clear();
    },
  };
}
