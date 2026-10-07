import { memo } from "react";

import { atlasRegion, type AtlasRectangle } from "$/base/theme/atlas-region-cache";
import type { UiBitmap } from "$/base/theme/theme-assets-store";

import styles from "$/base/theme/theme-part.module.css";

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
