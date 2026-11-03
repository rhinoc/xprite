import type { PixelBuffer } from "$/base/primitives";
import {
  CellColorPicker,
  OutlinePrepass,
  defaultPixelationSettings,
  type PixelGridAnalysis,
  type PixelationSettings,
} from "@xprite/pixelate";

/** Initial processing rules shared by still-image and animation imports. */
export function defaultImportPixelationSettings(
  image: Pick<PixelBuffer, "width" | "height">,
  grid?: PixelGridAnalysis,
  colorPicker = CellColorPicker.MostCommon,
): PixelationSettings {
  const photo = grid?.reliable === false;
  return {
    ...defaultPixelationSettings(image, grid),
    prepass: photo ? OutlinePrepass.PixeloeLines : OutlinePrepass.None,
    colorPicker: photo ? CellColorPicker.Contrast : colorPicker,
    reduceColors: false,
    blockPicker: true,
  };
}
