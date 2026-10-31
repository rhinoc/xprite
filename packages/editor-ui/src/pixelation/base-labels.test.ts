import { describe, expect, it } from "vitest";

import {
  ALGORITHM_LABELS,
  PICKER_LABELS,
  PIXELATION_BASE_TEXTS,
  pixelationLabelKey,
} from "$/pixelation/base-labels";
import { getAllAlgorithms, getAllColorPickers } from "@xprite/pixelate";

describe("shared pixelation labels", () => {
  it("labels every registry algorithm and colour picker distinctly", () => {
    const algorithms = getAllAlgorithms().map((id) => ALGORITHM_LABELS[id].key);
    const pickers = getAllColorPickers().map((id) => PICKER_LABELS[id].key);
    expect(algorithms.every(Boolean) && new Set(algorithms).size).toBe(algorithms.length);
    expect(pickers.every(Boolean) && new Set(pickers).size).toBe(pickers.length);
  });
  it("maps shared texts to the editor key and leaves other texts alone", () => {
    expect(pixelationLabelKey("Contrast")).toBe("import.picker.contrast");
    expect(pixelationLabelKey("Cancel")).toBe("Cancel");
    expect(new Set(PIXELATION_BASE_TEXTS).size).toBe(PIXELATION_BASE_TEXTS.length);
  });
});
