import { memo } from "react";

import type { UiBitmap } from "$/base/theme/theme-assets-store";
import { UINT8_MAX } from "$/base/utils/numeric-constants";

import styles from "$/base/theme/theme-part.module.css";

interface AtlasRectangle {
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

/** Crop before stretching so the renderer cannot sample neighboring atlas pixels. */
function atlasRegion(sheet: UiBitmap, source: AtlasRectangle): CroppedRegion {
  let cache = croppedRegions.get(sheet);
  if (!cache) {
    cache = new Map();
    croppedRegions.set(sheet, cache);
  }
  const key = `${source.x},${source.y},${source.width},${source.height}`;
  const cached = cache.get(key);
  if (cached) return cached;
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
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const runs: PixelRun[] = [];
  let previousRow = new Map<string, PixelRun>();
  for (let y = 0; y < canvas.height; y++) {
    const currentRow = new Map<string, PixelRun>();
    for (let x = 0; x < canvas.width;) {
      const start = x;
      const offset = (y * canvas.width + x) * PIXEL_CHANNELS;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const alpha = pixels[offset + 3];
      x++;
      while (x < canvas.width) {
        const next = (y * canvas.width + x) * PIXEL_CHANNELS;
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

/** Reuse the atlas palette as filled paths instead of resampling a bitmap.
 * Adjacent pixel runs share rounded device-pixel boundaries for every scale.
 */
interface AtlasRegionProps {
  sheet: UiBitmap;
  source: AtlasRectangle;
  destination: AtlasRectangle;
  cssPixelScale: { x: number; y: number };
  tint?: string;
}

function regionRectangles({
  sheet,
  source,
  destination,
}: Pick<AtlasRegionProps, "sheet" | "source" | "destination">) {
  if (source.width <= 0 || source.height <= 0 || destination.width <= 0 || destination.height <= 0)
    return [];
  const snap = Math.round;
  const rectangles: (AtlasRectangle & { color: string; opacity: number })[] = [];
  for (const run of atlasRegion(sheet, source).runs) {
    const left = snap(destination.x + (run.x * destination.width) / source.width);
    const right = snap(destination.x + ((run.x + run.width) * destination.width) / source.width);
    const top = snap(destination.y + (run.y * destination.height) / source.height);
    const bottom = snap(
      destination.y + ((run.y + run.height) * destination.height) / source.height,
    );
    if (right <= left || bottom <= top) continue;
    rectangles.push({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      color: run.color,
      opacity: run.opacity,
    });
  }
  return rectangles;
}

/** Filled DOM rectangles avoid the intermediate SVG image surface in CSS zoom. */
export const AtlasRegion = memo(
  function AtlasRegion({ cssPixelScale, tint, ...props }: AtlasRegionProps) {
    return regionRectangles(props).map((rectangle, index) => (
      <span
        key={index}
        className={styles.themePixelBlock}
        style={{
          left: rectangle.x * cssPixelScale.x,
          top: rectangle.y * cssPixelScale.y,
          width: rectangle.width * cssPixelScale.x,
          height: rectangle.height * cssPixelScale.y,
          backgroundColor: tint ?? rectangle.color,
          opacity: tint ? rectangle.opacity : undefined,
        }}
      />
    ));
  },
  (previous, next) =>
    previous.sheet === next.sheet &&
    previous.tint === next.tint &&
    previous.cssPixelScale.x === next.cssPixelScale.x &&
    previous.cssPixelScale.y === next.cssPixelScale.y &&
    previous.source.x === next.source.x &&
    previous.source.y === next.source.y &&
    previous.source.width === next.source.width &&
    previous.source.height === next.source.height &&
    previous.destination.x === next.destination.x &&
    previous.destination.y === next.destination.y &&
    previous.destination.width === next.destination.width &&
    previous.destination.height === next.destination.height,
);
