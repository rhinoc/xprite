import { describe, expect, it } from "vitest";

import { assertDocumentMemoryBudget } from "$/document/memory-budget";
import type { EditorDocument } from "$/document/types";

describe("document pixel memory budget", () => {
  it("charges linked images once, while retaining separate copies of independent cels", () => {
    const pixels = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
    const cel = { pixels, x: 0, y: 0, opacity: 255, zIndex: 0 };
    const document: EditorDocument = {
      name: "Linked animation",
      width: 2,
      height: 2,
      selection: null,
      layer: { name: "Ink", pixels, x: 0, y: 0, visible: true, locked: false },
      timeline: {
        activeFrame: 0,
        activeLayer: 0,
        layers: [{ id: "ink", name: "Ink", visible: true, locked: false, flags: 3, opacity: 255 }],
        frames: [
          { duration: 100, cels: [cel] },
          { duration: 100, cels: [{ ...cel }] },
        ],
      },
    };
    expect(() => assertDocumentMemoryBudget(document, 16)).not.toThrow();
    document.timeline!.frames[1].cels = [
      {
        ...cel,
        pixels: { ...pixels, data: pixels.data.slice() },
      },
    ];
    expect(() => assertDocumentMemoryBudget(document, 24)).toThrow(
      /previous state has been preserved/,
    );
    expect(document.timeline!.frames).toHaveLength(2);
    expect(pixels.data).toEqual(new Uint8ClampedArray(16));
  });
});
