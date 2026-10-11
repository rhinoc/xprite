import { centerThemePixel } from "$/base/theme/text-metrics";
import type { SurfaceBounds } from "$/components/canvas-surface";

const CLASSIC_ARROW_TOP_INSET = 6;
const CLASSIC_ARROW_AREA_INSET = 16;
const CLASSIC_ARROW_HEIGHT = 16;

/** Match the skin's dropdown arrow placement, including padded classic atlas artwork. */
export function dropdownArrowOffsetY(
  bounds: Pick<SurfaceBounds, "y" | "height">,
  iconHeight: number,
  centered: boolean,
): number {
  return centered
    ? (bounds.height - iconHeight) / 2
    : centerThemePixel(
        bounds.y + CLASSIC_ARROW_TOP_INSET,
        bounds.height - CLASSIC_ARROW_AREA_INSET,
        CLASSIC_ARROW_HEIGHT,
      ) - bounds.y;
}
