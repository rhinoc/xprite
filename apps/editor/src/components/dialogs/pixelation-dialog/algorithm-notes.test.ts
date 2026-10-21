import { describe, expect, it } from "vitest";

import { algorithmNoteKey } from "$/components/dialogs/pixelation-dialog/algorithm-notes";
import { getAllAlgorithms, PixelationAlgorithm } from "$/managers/preferences/file-preferences";

describe("import dialog algorithm copy", () => {
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
});
