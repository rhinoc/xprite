import type { PixelBuffer } from "$/base/primitives";
import { sourceLineMask } from "$/import-export/image/import/line-guided/pixeloe-entry";
import { pixeloePrepass } from "$/import-export/image/import/pixeloe-prepass";
import {
  CellColorPicker,
  LineGuideMode,
  OutlinePrepass,
  PixelationAlgorithm,
  PixelationMode,
  type PixelGridAnalysis,
  type PixelGridGeometry,
} from "$/import-export/image/import/types";

/**
 * Whether these options run stock PixelOE end to end (its contrast downscale and colour match to the
 * output size) instead of a pre-pass followed by the picker: a PixelOE pre-pass with the Contrast
 * picker, when the cells are not a grid recovered from the source (a plain convert, or Custom size's
 * even blocks). This is the PixelOE reference output.
 */
export function runsStockPixeloe(
  options: { prepass?: OutlinePrepass; colorPicker?: CellColorPicker; mode?: PixelationMode },
  grid?: PixelGridGeometry,
): boolean {
  if ((options.prepass ?? OutlinePrepass.None) === OutlinePrepass.None) return false;
  if (options.colorPicker !== CellColorPicker.Contrast) return false;
  if (options.mode === PixelationMode.Convert) return true;
  return (grid as PixelGridAnalysis | undefined)?.algorithm === PixelationAlgorithm.CustomSize;
}

/** The image -> image pre-pass (the original PixelOE pre-pass, optionally line-guided). */
export function applyOutlinePrepass(
  image: PixelBuffer,
  cell: number,
  prepass: OutlinePrepass,
  lineGuide: LineGuideMode = DEFAULT_LINE_GUIDE,
): PixelBuffer {
  if (prepass === OutlinePrepass.None) return image;
  if (prepass === OutlinePrepass.Pixeloe) return pixeloePrepass(image, cell);
  const mask = sourceLineMask(image);
  return pixeloePrepass(image, cell, mask ? { mask, mode: lineGuide } : undefined);
}

/**
 * The pre-pass every source opens with, whether or not a grid is found: PixelOE + lines (with the
 * Contrast picker). None, the plain grid recovery, is one choice away in the controls.
 */
export const DEFAULT_OUTLINE_PREPASS = OutlinePrepass.PixeloeLines;

/**
 * The line guide PixelOE + lines starts with: Lines only (the line mask replaces PixelOE's outline
 * weight). Add to outlines barely differs from plain PixelOE on line art, while Lines only keeps
 * continuous drawn lines (e.g. an eye line) through the downscale.
 */
export const DEFAULT_LINE_GUIDE = LineGuideMode.Replace;

/**
 * A pre-pass from saved settings: the current value, or the old `pixeloePrepass` checkbox
 * (true -> PixelOE, false -> None).
 */
export function readOutlinePrepass(saved: {
  prepass?: unknown;
  pixeloePrepass?: unknown;
}): OutlinePrepass | undefined {
  if (Object.values(OutlinePrepass).includes(saved.prepass as OutlinePrepass))
    return saved.prepass as OutlinePrepass;
  if (typeof saved.pixeloePrepass === "boolean")
    return saved.pixeloePrepass ? OutlinePrepass.Pixeloe : OutlinePrepass.None;
  return undefined;
}
