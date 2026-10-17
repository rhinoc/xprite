import { describe, expect, it } from "vitest";

import {
  algorithmLabelKey,
  algorithmNoteKey,
  colorPickerLabelKey,
} from "$/components/dialogs/pixelation-dialog/algorithm-notes";
import {
  getAllAlgorithms,
  getAllColorPickers,
  PixelationAlgorithm,
} from "$/managers/preferences/file-preferences";

describe("import dialog algorithm copy", () => {
  it("has a distinct label for every registry algorithm", () => {
    const labels = getAllAlgorithms().map(algorithmLabelKey);
    expect(new Set(labels).size).toBe(labels.length);
  });
  it("says nothing when a grid was found", () => {
    for (const algorithm of getAllAlgorithms())
      expect(algorithmNoteKey(algorithm, true)).toBeNull();
  });
  it("explains a missing grid for every grid algorithm, and not for the ones that never miss", () => {
    for (const algorithm of getAllAlgorithms())
      expect(algorithmNoteKey(algorithm, false) === null).toBe(
        [PixelationAlgorithm.Resize, PixelationAlgorithm.CustomSize].includes(algorithm),
      );
  });
  it("has a distinct label for every colour picker", () => {
    const labels = getAllColorPickers().map(colorPickerLabelKey);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
