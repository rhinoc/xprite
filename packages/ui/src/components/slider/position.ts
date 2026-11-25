import type * as React from "react";

import {
  RASTER_SCALE,
  surfaceLayout,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";
import type { Placement } from "$/components/slider/types";

/**
 * Compute the filled track/text clip width on the raster pixel grid.
 * Mirrors SkinTheme::paintSlider (x - rc.x + 1 in 1x theme pixels = +RASTER_SCALE),
 * clamped cleanly to [0, width] so min/max never leave overhang or negative widths.
 */
export function sliderSplitWidth(
  value: number,
  min: number,
  max: number,
  width: number,
  border = 0,
): number {
  if (width <= 0 || max <= min || value <= min) return 0;
  if (value >= max) return width;
  const inner = Math.max(0, width - 2 * border);
  const splitOffset =
    border + Math.trunc(((inner / RASTER_SCALE) * (value - min)) / (max - min)) * RASTER_SCALE;
  return Math.max(0, Math.min(width, splitOffset + RASTER_SCALE));
}

export function position(
  bounds: SurfaceBounds,
  relativeTo: Placement["relativeTo"],
  viewport: SurfaceViewport,
  positioned: boolean,
): React.CSSProperties {
  const layout = surfaceLayout(bounds, viewport);
  return {
    position: positioned ? "absolute" : "relative",
    ...(positioned
      ? {
          left:
            layout.left - Math.floor(((relativeTo?.x ?? 0) * viewport.width) / viewport.sceneWidth),
          top:
            layout.top -
            Math.floor(((relativeTo?.y ?? 0) * viewport.height) / viewport.sceneHeight),
        }
      : {}),
    width: layout.width,
    height: layout.height,
    outline: "none",
    touchAction: "none",
    userSelect: "none",
  };
}
