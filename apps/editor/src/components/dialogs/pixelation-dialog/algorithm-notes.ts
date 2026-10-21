import { PixelationAlgorithm } from "$/managers/preferences/file-preferences";

/** Inline message when the algorithm found no usable grid; the preview then falls back to a resize. */
const MISSING: Readonly<Record<PixelationAlgorithm, string | null>> = {
  [PixelationAlgorithm.Auto]: "import.note.auto.none",
  [PixelationAlgorithm.UniformGrid]: "import.note.uniform-grid.none",
  [PixelationAlgorithm.EdgeGrid]: "import.note.edge-grid.none",
  [PixelationAlgorithm.CustomSize]: null,
  [PixelationAlgorithm.PixeloeLines]: null,
  [PixelationAlgorithm.Pixeloe]: null,
  [PixelationAlgorithm.Resize]: null,
};

/** The inline note for the chosen algorithm, or null when nothing needs saying. */
export function algorithmNoteKey(
  algorithm: PixelationAlgorithm,
  gridFound: boolean,
): string | null {
  return gridFound ? null : MISSING[algorithm];
}
