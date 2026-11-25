import { describe, expect, it } from "vitest";

import type { Rgba } from "$/base/primitives";
import { analyzePalette, snapDocumentToPalette } from "$/color/palette-agent";
import { BatchEditKind } from "$/editor/batch-edit-types";
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

describe("analyzePalette", () => {
  it("separates blend-mode and partial-opacity composite shades from raw cel off-palette violations", () => {
    const palette: readonly Rgba[] = [
      [30, 50, 90, 255],
      [255, 190, 80, 255],
    ];
    const editor = new RasterEditor();
    editor.document.loadImage(
      { width: 2, height: 2, data: new Uint8ClampedArray(16) },
      "Glow",
      palette,
    );
    const baseLayerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    editor.applyBatch(
      [
        {
          type: BatchEditKind.FillRect,
          layerId: baseLayerId,
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 2, height: 2 },
          color: "#1E325A",
        },
        {
          type: BatchEditKind.AddLayer,
          layerId: "glow",
          name: "Warm Glow",
          afterLayerId: baseLayerId,
        },
        {
          type: BatchEditKind.SetLayer,
          layerId: "glow",
          blendMode: "Screen",
          opacity: 128,
        },
        {
          type: BatchEditKind.FillRect,
          layerId: "glow",
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 2, height: 2 },
          color: "#FFBE50",
        },
      ],
      editor.getContentRevision(),
      "Paint base and screen glow layers using palette colors",
    );

    const analysis = analyzePalette(editor.getSnapshot().document!, palette);
    expect(analysis.offPaletteColors).toEqual([]);
    expect(analysis.blendedCompositeColors.length).toBeGreaterThan(0);
    expect(analysis.unusedIndices).toEqual([]);
    expect(analysis.verdict).toBe("clean");
  });

  it("still flags genuine raw cel off-palette pixels alongside blend-mode layers", () => {
    const palette: readonly Rgba[] = [
      [30, 50, 90, 255],
      [255, 190, 80, 255],
    ];
    const editor = new RasterEditor();
    editor.document.loadImage(
      { width: 2, height: 1, data: new Uint8ClampedArray(8) },
      "MixedOffPalette",
      palette,
    );
    const baseLayerId = editor.getSnapshot().document!.timeline!.layers[0].id;
    editor.applyBatch(
      [
        {
          type: BatchEditKind.FillRect,
          layerId: baseLayerId,
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 1, height: 1 },
          color: "#1E325A",
        },
        {
          type: BatchEditKind.FillRect,
          layerId: baseLayerId,
          frameIndex: 0,
          rect: { x: 1, y: 0, width: 1, height: 1 },
          color: "#12AB34",
        },
        {
          type: BatchEditKind.AddLayer,
          layerId: "glow",
          name: "Warm Glow",
          afterLayerId: baseLayerId,
        },
        {
          type: BatchEditKind.SetLayer,
          layerId: "glow",
          blendMode: "Screen",
          opacity: 128,
        },
        {
          type: BatchEditKind.FillRect,
          layerId: "glow",
          frameIndex: 0,
          rect: { x: 0, y: 0, width: 1, height: 1 },
          color: "#FFBE50",
        },
      ],
      editor.getContentRevision(),
      "Paint one off-palette raw pixel plus screen glow",
    );

    const analysis = analyzePalette(editor.getSnapshot().document!, palette);
    expect(analysis.offPaletteColors).toEqual([{ hex: "#12AB34", pixels: 1 }]);
    expect(analysis.blendedCompositeColors.length).toBe(1);
    expect(analysis.verdict).toContain("1 color(s) in the art are not in the palette");
  });
});
