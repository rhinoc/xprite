import { describe, expect, it } from "vitest";

import type { Rgba } from "$/base/primitives";
import { snapDocumentToPalette } from "$/color/palette-agent";
import { RasterEditor } from "$/editor/RasterEditor";

const colors: readonly Rgba[] = [
  [0, 0, 0, 0],
  [255, 0, 0, 255],
  [0, 255, 0, 255],
];
const image = (data: readonly number[]) => ({
  width: data.length / 4,
  height: 1,
  data: new Uint8ClampedArray(data),
});

describe("snapDocumentToPalette", () => {
  it("repaints off-palette pixels to the nearest palette color and keeps alpha", () => {
    const editor = new RasterEditor();
    editor.document.loadImage(
      image([250, 10, 10, 255, 0, 240, 0, 128, 0, 0, 0, 0]),
      "document",
      colors,
    );
    const doc = editor.getSnapshot().document!;
    const { regions } = snapDocumentToPalette(doc, colors);
    expect(regions).toHaveLength(1);
    const region = regions[0];
    expect(region.frameIndex).toBe(0);
    expect(region.rect).toEqual({ x: 0, y: 0, width: 3, height: 1 });
    // Red-ish snaps to red, green-ish snaps to green, transparent stays.
    expect(region.rgba.slice(0, 4)).toEqual([255, 0, 0, 255]);
    expect(region.rgba.slice(4, 8)).toEqual([0, 255, 0, 128]);
    expect(region.rgba.slice(8, 12)).toEqual([0, 0, 0, 0]);
  });
  it("returns no regions when every pixel is already on the palette", () => {
    const editor = new RasterEditor();
    editor.document.loadImage(image(colors[1]), "document", colors);
    expect(snapDocumentToPalette(editor.getSnapshot().document!, colors)).toEqual({
      regions: [],
      skippedLayers: [],
    });
  });
  it("skips documents without a timeline", () => {
    const doc = { width: 1, height: 1 } as Parameters<typeof snapDocumentToPalette>[0];
    expect(snapDocumentToPalette(doc, colors)).toEqual({ regions: [], skippedLayers: [] });
  });
});
