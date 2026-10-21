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
  lineGuide: LineGuideMode = LineGuideMode.Union,
): PixelBuffer {
  if (prepass === OutlinePrepass.None) return image;
  if (prepass === OutlinePrepass.Pixeloe) return pixeloePrepass(image, cell);
  const mask = sourceLineMask(image);
  return pixeloePrepass(image, cell, mask ? { mask, mode: lineGuide } : undefined);
}

/**
 * The pre-pass a source opens with: none when a reliable grid is recovered (pixel art keeps its
 * own pixels), PixelOE + lines otherwise.
 */
export function defaultOutlinePrepass(grid?: Pick<PixelGridAnalysis, "reliable">): OutlinePrepass {
  return grid?.reliable ? OutlinePrepass.None : OutlinePrepass.PixeloeLines;
}

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
