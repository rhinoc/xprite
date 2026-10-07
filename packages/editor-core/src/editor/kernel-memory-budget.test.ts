import { describe, expect, it } from "vitest";

import { EditorAllocationError } from "$/base/errors";
import type { EditorDocument } from "$/document/types";
import { EditorKernel } from "$/editor/kernel";

describe("oversized document edits", () => {
  it("rolls back an edit that would make the committed project impossible to reopen", () => {
    const pixels = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
    pixels.data.set([19, 37, 53, 255]);
    const document: EditorDocument = {
      name: "Keep my work",
      width: 2,
      height: 2,
      selection: null,
      layer: { name: "Ink", pixels, x: 0, y: 0, visible: true, locked: false },
      timeline: {
        activeFrame: 0,
        activeLayer: 0,
        layers: [{ id: "ink", name: "Ink", visible: true, locked: false, flags: 3, opacity: 255 }],
        frames: [{ duration: 100, cels: [{ pixels, x: 0, y: 0, opacity: 255, zIndex: 0 }] }],
      },
    };
    const kernel = new EditorKernel();
    kernel.replaceDocument(document);
    // Each image is individually legal; their combined pixel budget is not.
    // The guard inspects lengths without encoding or copying these buffers.
    const frames = Array.from({ length: 2 }, () => ({
      duration: 100,
      cels: [
        {
          pixels: { width: 4000, height: 8001, data: new Uint8ClampedArray(4000 * 8001 * 4) },
          x: 0,
          y: 0,
          opacity: 255,
          zIndex: 0,
        },
      ],
    }));
    expect(() =>
      kernel.runHistoryTransaction(
        document,
        "Grow animation",
        () => {
          document.width = 4000;
          document.height = 8001;
          document.timeline = { ...document.timeline!, frames };
          document.layer.pixels = frames[0].cels[0].pixels;
        },
        () => {},
      ),
    ).toThrow(EditorAllocationError);
    expect(kernel.getDocument()).toBe(document);
    expect(document.width).toBe(2);
    expect(document.height).toBe(2);
    expect(document.timeline!.frames).toHaveLength(1);
    expect(document.layer.pixels).toBe(pixels);
    expect(Array.from(pixels.data.subarray(0, 4))).toEqual([19, 37, 53, 255]);
    expect(kernel.getHistorySnapshot().currentIndex).toBe(-1);
  });
});
