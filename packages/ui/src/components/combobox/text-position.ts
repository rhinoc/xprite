import { centerThemePixel } from "$/base/theme/text-metrics";
import type { UiStyleDefinition } from "$/base/theme/theme-types";
import { FIELD_ROW_HEIGHT, RASTER_SCALE, type SurfaceBounds } from "$/components/canvas-surface";

const CLASSIC_BOTTOM_BORDER_INSET = 6;

/** Resolve the combobox trigger height from explicit pixelSize, theme dimension, or standard field row height. */
export function comboboxNaturalHeight(
  pixelSize: { width: number; height: number } | undefined,
  theme: Pick<UiStyleDefinition, "dimensions">,
): number {
  return pixelSize
    ? pixelSize.height * RASTER_SCALE
    : (theme.dimensions.combobox_height ?? FIELD_ROW_HEIGHT);
}

/**
 * Compute the local vertical text offset inside a closed combobox trigger.
 *
 * Skins with an explicit `combobox_text_offset_y` or popup-menu frame (such as Macintosh)
 * keep their calibrated baseline. Bitmap nine-slice frames (`sunken2_normal`) have an
 * asymmetric top chrome (border + inner shadow = `slices[3] * RASTER_SCALE`) and a 6px
 * bottom border/bevel: on compact heights (such as 30px), `centerThemePixel` rounds up into
 * the top inner shadow and border. Pushing down to `clearFaceTop` whenever the remaining
 * cavity fits `fontHeight` keeps both CJK and Latin glyphs cleanly inside the white face.
 */
export function comboboxTextOffsetY(
  bounds: Pick<SurfaceBounds, "y" | "height">,
  fontHeight: number,
  theme: Pick<UiStyleDefinition, "dimensions" | "parts" | "controlParts">,
): number {
  const explicitOffset = theme.dimensions.combobox_text_offset_y;
  const centered = centerThemePixel(0, bounds.height, fontHeight) + (explicitOffset ?? 0);
  if (explicitOffset !== undefined || theme.controlParts?.combobox?.popupMenu) return centered;
  const facePart = theme.controlParts?.combobox?.faceNormal ?? "sunken2_normal";
  const slices = theme.parts[facePart]?.slices;
  if (!slices) return centered;
  const clearFaceTop = slices[3] * RASTER_SCALE;
  const maxTop = bounds.height - CLASSIC_BOTTOM_BORDER_INSET - fontHeight;
  return Math.max(centered, Math.min(clearFaceTop, maxTop));
}
