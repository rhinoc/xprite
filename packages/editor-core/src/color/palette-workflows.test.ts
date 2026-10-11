import { describe, expect, it } from "vitest";

import type { Rgba } from "$/base/primitives";
import { resizePaletteColors } from "$/color/palette-resize";
import { PaletteHistoryLabel, PaletteScope } from "$/color/palette/controller";
import { PaletteQuantizationAlgorithm, quantizePalette } from "$/color/quantization";
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
describe("palette workflow state", () => {
  it("quantizes every supplied frame and preserves source colors below the target count", () => {
    const frames = [image(colors[1]), image(colors[2])];
    for (const algorithm of [
      PaletteQuantizationAlgorithm.Default,
      PaletteQuantizationAlgorithm.Octree,
      PaletteQuantizationAlgorithm.Rgb5a3,
    ])
      expect(quantizePalette(frames, 256, true, algorithm)).toEqual(colors);
  });
  it("reserves transparency and applies the alpha-channel choice", () => {
    const frame = image([17, 35, 71, 128, 0, 0, 0, 0]);
    expect(quantizePalette([frame], 256, true)).toEqual([
      [0, 0, 0, 0],
      [17, 35, 71, 128],
    ]);
    expect(quantizePalette([frame], 256, false)).toEqual([
      [0, 0, 0, 0],
      [17, 35, 71, 255],
    ]);
    expect(quantizePalette([frame], 256, false, PaletteQuantizationAlgorithm.Rgb5a3)).toEqual([
      [0, 0, 0, 255],
      [17, 35, 71, 255],
    ]);
  });
  it("keeps system palette loading out of document content, history, and dirty state", () => {
    const editor = new RasterEditor();
    editor.document.loadImage(image(colors[1]), "document", colors);
    const before = editor.getSnapshot();
    editor.color.useSystemPalette();
    editor.color.setPalette([[7, 9, 11, 255]], { scope: PaletteScope.System });
    const after = editor.getSnapshot();
    expect(after.palette).toEqual(colors);
    expect(editor.color.systemPalette).toEqual([[7, 9, 11, 255]]);
    expect(after.dirty).toBe(false);
    expect(after.persistenceRevision).toBe(before.persistenceRevision);
    expect(editor.history.getSnapshot().states).toHaveLength(0);
    editor.color.useDocumentPalette();
    expect(editor.color.systemPalette).toEqual(colors);
  });
  it("groups live edits, restores indexed foreground values, and preserves save boundaries", () => {
    const editor = new RasterEditor();
    editor.document.loadImage(image(colors[1]), "document", colors);
    editor.drawing.settings.setSettings({ foregroundIndex: 1, foreground: colors[1] });
    const options = { label: PaletteHistoryLabel.Change, coalesce: true };
    editor.color.setPalette([colors[0], [10, 20, 30, 255], colors[2]], options);
    editor.color.setPalette([colors[0], [40, 50, 60, 255], colors[2]], options);
    expect(editor.history.getSnapshot().states).toHaveLength(1);
    editor.history.undo();
    expect(editor.getSnapshot().palette).toEqual(colors);
    expect(editor.getSnapshot().settings.foreground).toEqual(colors[1]);
    expect(editor.getSnapshot().dirty).toBe(false);
    editor.history.redo();
    editor.history.markSaved();
    editor.color.setPalette([colors[0], [70, 80, 90, 255], colors[2]], options);
    expect(editor.history.getSnapshot().states).toHaveLength(2);
    editor.history.undo();
    expect(editor.getSnapshot().palette[1]).toEqual([40, 50, 60, 255]);
    expect(editor.getSnapshot().dirty).toBe(false);
  });
  it("supports palettes above 65,536 entries with a single reversible size action", () => {
    const editor = new RasterEditor();
    editor.document.loadImage(image(colors[1]), "large palette", colors);
    editor.color.setPalette(resizePaletteColors(colors, 100_000), {
      label: PaletteHistoryLabel.Size,
    });
    expect(editor.getSnapshot().palette).toHaveLength(100_000);
    expect(editor.history.getSnapshot().states.at(-1)?.label).toBe("Palette Size");
    editor.history.undo();
    expect(editor.getSnapshot().palette).toEqual(colors);
    expect(editor.getSnapshot().dirty).toBe(false);
  });
});
