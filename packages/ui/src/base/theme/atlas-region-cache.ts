import type { UiBitmap } from "$/base/theme/theme-assets-store";
import { UINT8_MAX } from "$/base/utils/numeric-constants";

export interface AtlasRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PixelRun {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
}
interface CroppedRegion {
  runs: readonly PixelRun[];
}
const PIXEL_CHANNELS = 4;
const croppedRegions = new WeakMap<UiBitmap, Map<string, CroppedRegion>>();

interface AtlasPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

// Theme bitmaps are immutable. Replacing a bitmap naturally selects a new cache;
// neither this pixel buffer nor the region runs retain the bitmap WeakMap key.
const atlasPixels = new WeakMap<UiBitmap, AtlasPixels>();

function readPixels(sheet: UiBitmap, source: AtlasRectangle): AtlasPixels {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Cannot crop theme atlas region");
  context.imageSmoothingEnabled = false;
  context.drawImage(
    sheet,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    source.width,
    source.height,
  );
  return {
    width: canvas.width,
    height: canvas.height,
    data: context.getImageData(0, 0, canvas.width, canvas.height).data,
  };
}

function regionPixels(sheet: UiBitmap, source: AtlasRectangle): AtlasPixels {
  // Noninteger source coordinates use drawImage's existing nearest-neighbor
  // sampling and canvas dimension coercion. Theme manifests use integer pixels.
  if (![source.x, source.y, source.width, source.height].every(Number.isInteger))
    return readPixels(sheet, source);

  let atlas = atlasPixels.get(sheet);
  if (!atlas) {
    const width = "naturalWidth" in sheet ? sheet.naturalWidth : sheet.width;
    const height = "naturalHeight" in sheet ? sheet.naturalHeight : sheet.height;
    // Keep the native canvas round trip so translucent RGB channels retain the
    // same premultiplication/unpremultiplication rounding as the previous crop.
    atlas = readPixels(sheet, { x: 0, y: 0, width, height });
    atlasPixels.set(sheet, atlas);
  }

  const { width, height } = source;
  const data = new Uint8ClampedArray(width * height * PIXEL_CHANNELS);
  const left = Math.max(0, source.x);
  const right = Math.min(atlas.width, source.x + width);
  const top = Math.max(0, source.y);
  const bottom = Math.min(atlas.height, source.y + height);
  if (right > left) {
    for (let y = top; y < bottom; y++) {
      const offset = (y * atlas.width + left) * PIXEL_CHANNELS;
      const target = ((y - source.y) * width + left - source.x) * PIXEL_CHANNELS;
      data.set(atlas.data.subarray(offset, offset + (right - left) * PIXEL_CHANNELS), target);
    }
  }
  // Untouched bytes pad regions outside the sheet with transparent pixels.
  return { width, height, data };
}

/** Crop before stretching so the renderer cannot sample neighboring atlas pixels. */
export function atlasRegion(sheet: UiBitmap, source: AtlasRectangle): CroppedRegion {
  let cache = croppedRegions.get(sheet);
  if (!cache) {
    cache = new Map();
    croppedRegions.set(sheet, cache);
  }
  const key = `${source.x},${source.y},${source.width},${source.height}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const { data: pixels, width, height } = regionPixels(sheet, source);
  const runs: PixelRun[] = [];
  let previousRow = new Map<string, PixelRun>();
  for (let y = 0; y < height; y++) {
    const currentRow = new Map<string, PixelRun>();
    for (let x = 0; x < width;) {
      const start = x;
      const offset = (y * width + x) * PIXEL_CHANNELS;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const alpha = pixels[offset + 3];
      x++;
      while (x < width) {
        const next = (y * width + x) * PIXEL_CHANNELS;
        if (
          pixels[next] !== red ||
          pixels[next + 1] !== green ||
          pixels[next + 2] !== blue ||
          pixels[next + 3] !== alpha
        )
          break;
        x++;
      }
      if (alpha) {
        const color = `rgba(${red},${green},${blue},${alpha / UINT8_MAX})`;
        const key = `${start},${x - start},${color}`;
        const previous = previousRow.get(key);
        const run = previous ?? {
          x: start,
          y,
          width: x - start,
          height: 0,
          color,
          opacity: alpha / UINT8_MAX,
        };
        run.height++;
        if (!previous) runs.push(run);
        currentRow.set(key, run);
      }
    }
    previousRow = currentRow;
  }
  const region = { runs };
  cache.set(key, region);
  return region;
}
