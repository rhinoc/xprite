import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("palette-resize", () => {
  it("palette-resize behavior", async () => {
    const result = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const {
      RasterEditor,
      resizePaletteColors,
      paletteResizeHandle,
      paletteResizeTarget,
      MAX_PALETTE_COLORS,
      createAsepriteIndexWriter,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`
    );
    const colors = [
      [13, 27, 41, 255],
      [1, 2, 3, 0],
      [91, 92, 93, 128],
    ];
    const grown = resizePaletteColors(colors, 5);
    assert.deepEqual(grown, [...colors, [0, 0, 0, 255], [0, 0, 0, 255]]);
    assert.notEqual(grown[0], colors[0]);
    assert.notEqual(grown[3], grown[4]);
    assert.deepEqual(resizePaletteColors(colors, 1), [colors[0]]);
    for (const invalid of [0, -1, 1.5, Infinity, NaN, MAX_PALETTE_COLORS + 1])
      assert.throws(() => resizePaletteColors(colors, invalid), RangeError);
    const geometry = { origin: { x: 12, y: 100 }, columns: 5, cellSize: 22, scrollY: 24 };
    assert.deepEqual(paletteResizeHandle(5, geometry), { x: 12, y: 100, width: 22, height: 22 });
    assert.equal(paletteResizeTarget({ x: 12, y: 100 }, geometry), 5);
    assert.equal(paletteResizeTarget({ x: 59, y: 100 }, geometry), 6);
    assert.equal(paletteResizeTarget({ x: 60, y: 100 }, geometry), 7);
    assert.equal(paletteResizeTarget({ x: 0, y: 0 }, geometry), 0);
    assert.equal(paletteResizeTarget({ x: 140, y: 124 }, geometry), 15);
    assert.equal(paletteResizeTarget({ x: 1e6, y: 1e6 }, geometry), MAX_PALETTE_COLORS);
    const editor = new RasterEditor();
    const image = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([13, 27, 41, 255, 91, 92, 93, 128]),
    };
    editor.document.loadImage(image, "Palette resize", colors);
    const pixels = editor.canvas.composite(),
      revision = editor.getSnapshot().pixelRevision;
    editor.color.setPalette(grown);
    assert.equal(editor.getSnapshot().palette.length, 5);
    assert.equal(editor.getSnapshot().dirty, true);
    assert.equal(editor.canvas.composite(), pixels);
    assert.equal(editor.getSnapshot().pixelRevision, revision);
    editor.history.undo();
    assert.deepEqual(editor.getSnapshot().palette, colors);
    assert.equal(editor.getSnapshot().dirty, false);
    editor.history.redo();
    assert.deepEqual(editor.getSnapshot().palette, grown);
    editor.color.setPalette(resizePaletteColors(grown, 1));
    assert.equal(editor.getSnapshot().palette.length, 1);
    assert.equal(editor.canvas.composite(), pixels);
    editor.history.undo();
    assert.equal(editor.getSnapshot().palette.length, 5);
    editor.color.setPalette(resizePaletteColors(colors, 300));
    assert.equal(editor.getSnapshot().palette.length, 300);
    assert.throws(
      () =>
        editor.color.setPalette(Array.from({ length: MAX_PALETTE_COLORS + 1 }, () => colors[0])),
      RangeError,
    );
    assert.equal(editor.getSnapshot().palette.length, 300);
    const indexedPalette = [
      [0, 0, 0, 0],
      [255, 0, 0, 255],
    ];
    editor.document.loadTimeline(
      {
        colorDepth: 8,
        transparentIndex: 0,
        activeFrame: 0,
        activeLayer: 0,
        layers: [
          { id: "layer", name: "Layer", visible: true, locked: false, opacity: 255, flags: 3 },
        ],
        frames: [
          {
            duration: 100,
            palette: indexedPalette,
            cels: [
              {
                pixels: { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) },
                asepriteSamples: { depth: 8, width: 1, height: 1, data: new Uint8Array([1]) },
                x: 0,
                y: 0,
                opacity: 255,
                zIndex: 0,
              },
            ],
          },
        ],
      },
      1,
      1,
      "Short indexed palette",
      indexedPalette,
    );
    editor.color.setPalette([indexedPalette[0]]);
    const shortened = editor.getSnapshot().document;
    assert.equal(shortened.timeline.frames[0].cels[0].asepriteSamples.data[0], 1);
    assert.deepEqual(Array.from(shortened.layer.pixels.data), [0, 0, 0, 0]);
    assert.equal(editor.getSnapshot().dirty, true);
    editor.history.undo();
    assert.deepEqual(editor.getSnapshot().palette, indexedPalette);
    assert.deepEqual(Array.from(editor.getSnapshot().document.layer.pixels.data), [255, 0, 0, 255]);
    assert.equal(editor.getSnapshot().dirty, false);
    editor.history.redo();
    assert.equal(
      editor.getSnapshot().document.timeline.frames[0].cels[0].asepriteSamples.data[0],
      1,
    );
    // A bank entry above 255 uses its RGBA fit, never an 8-bit modulo of its index.
    editor.color.setPalette(resizePaletteColors(indexedPalette, 257));
    const indexedDocument = editor.getSnapshot().document;
    const writer = createAsepriteIndexWriter(indexedDocument, undefined);
    assert.equal(writer.write(0, 0, [0, 0, 0, 255], 256), true);
    assert.equal(indexedDocument.timeline.frames[0].cels[0].asepriteSamples.data[0], 255);
    // Exact-color octree fitting keeps the last addressable duplicate (255).
    assert.equal(writer.write(0, 0, [255, 0, 0, 255], 1), true);
    assert.equal(indexedDocument.timeline.frames[0].cels[0].asepriteSamples.data[0], 1);
    for (const invalid of [-1, 1.5, 257])
      assert.equal(writer.write(0, 0, [0, 0, 0, 255], invalid), false);
    console.log(
      "Palette resize: source black fill, retained alpha, hit/handle geometry, limits, >256 colors, undo/redo, dirty state, and unchanged raster pass.",
    );
  }, 60_000);
});
