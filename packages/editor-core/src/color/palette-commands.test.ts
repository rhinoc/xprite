import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("palette-commands", () => {
  it("palette-commands behavior", async () => {
    const { outputFiles } = await build({
      stdin: {
        contents:
          "export {RasterEditor} from './packages/editor-core/src/editor/RasterEditor.ts';export * from './packages/editor-core/src/color/palette-commands.ts';export * from './packages/editor-core/src/color/palette-resize.ts';export * from './packages/editor-core/src/color/samples.ts';",
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const {
      RasterEditor,
      asepritePaletteColorIndex,
      stepAsepritePaletteIndex,
      MAX_PALETTE_COLORS,
      indexedPaletteColorIndex,
      expandAsepriteSamples,
      encodeAsepriteSamples,
      paletteForColors,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const black = [0, 0, 0, 255],
      red = [255, 0, 0, 255],
      green = [0, 255, 0, 255],
      blue = [0, 0, 255, 255];
    const e = new RasterEditor();
    e.document.loadImage({ width: 2, height: 2, data: new Uint8ClampedArray(16) }, "Palette", [
      black,
      red,
      green,
    ]);
    const image = e.canvas.composite(),
      revision = e.getSnapshot().pixelRevision;
    e.drawing.settings.setSettings({ foreground: green, background: black });
    assert.equal(e.color.stepPaletteColor("foreground", 1), 0);
    assert.deepEqual(e.getSnapshot().settings.foreground, black);
    assert.equal(e.color.stepPaletteColor("background", -1), 2);
    assert.deepEqual(e.getSnapshot().settings.background, green);
    assert.equal(e.getSnapshot().dirty, false);
    assert.equal(e.getSnapshot().canUndo, false);
    assert.equal(e.canvas.composite(), image);
    assert.equal(e.getSnapshot().pixelRevision, revision);
    assert.equal(e.color.stepPaletteColor("foreground", Infinity), null);
    // Aseprite RGBA lookup gives exact match priority, including mask index zero.
    assert.equal(asepritePaletteColorIndex([black, red, green], black), 0);
    assert.equal(asepritePaletteColorIndex([black, red, green], [1, 1, 1, 255]), 1); // Excludes mask0 for nonexact fits.
    assert.equal(asepritePaletteColorIndex([black, red, green], [200, 100, 30, 7]), 0);
    assert.equal(asepritePaletteColorIndex([black, red, green], [240, 15, 3, 255]), 1);
    assert.equal(asepritePaletteColorIndex([black, red, green], [15, 240, 3, 255]), 2);
    assert.equal(stepAsepritePaletteIndex(0, -8, 3), 1);
    assert.equal(stepAsepritePaletteIndex(2, 8, 3), 1);
    assert.equal(stepAsepritePaletteIndex(0, 1, 0), null);
    // An indexed duplicate selection must progress, not repeatedly rematch first RGB.
    e.color.setPalette([black, red, red, green]);
    e.history.markSaved();
    e.drawing.settings.setSettings({ foreground: black });
    assert.equal(e.color.stepPaletteColor("foreground", 1), 1);
    assert.equal(e.color.stepPaletteColor("foreground", 1), 2);
    assert.equal(e.color.stepPaletteColor("foreground", 1), 3);
    e.drawing.settings.setSettings({ foreground: red });
    assert.equal(e.color.stepPaletteColor("foreground", 1), 2);
    // AddColor is one palette history transaction; edit mode may also choose FG.
    e.document.loadImage({ width: 2, height: 2, data: new Uint8ClampedArray(16) }, "Palette", [
      black,
      red,
    ]);
    e.drawing.settings.setSettings({ foreground: red, background: blue });
    assert.deepEqual(e.color.addPaletteColor("background", true), {
      added: true,
      index: 2,
      foregroundIndex: 2,
      backgroundIndex: 2,
    });
    assert.deepEqual(e.getSnapshot().settings.foreground, blue);
    assert.deepEqual(e.getSnapshot().palette, [black, red, blue]);
    assert.equal(e.getSnapshot().dirty, true);
    e.history.undo();
    assert.deepEqual(e.getSnapshot().palette, [black, red]);
    assert.equal(e.getSnapshot().dirty, false);
    assert.equal(e.getSnapshot().canUndo, false);
    e.history.redo();
    assert.deepEqual(e.getSnapshot().palette, [black, red, blue]);
    const snapshot = e.getSnapshot();
    assert.deepEqual(e.color.addPaletteColor("background", true), {
      added: false,
      index: 2,
    });
    assert.equal(e.getSnapshot(), snapshot);
    e.history.markSaved();
    e.color.applyPaletteOperation("reverse");
    assert.deepEqual(e.getSnapshot().palette, [blue, red, black]);
    e.history.undo();
    assert.deepEqual(e.getSnapshot().palette, [black, red, blue]);
    assert.equal(e.getSnapshot().dirty, false);
    const colorBank = Array.from({ length: 256 }, (_, i) => [i, 0, 0, 255]);
    e.color.setPalette(colorBank);
    e.drawing.settings.setSettings({ foreground: green });
    assert.deepEqual(e.color.addPaletteColor("foreground"), { added: true, index: 256 });
    assert.equal(e.getSnapshot().palette.length, 257);
    const largePalette = [...colorBank, green];
    assert.equal(indexedPaletteColorIndex(green, largePalette, 256), 1);
    assert.equal(indexedPaletteColorIndex(red, [black, red, red], 2), 2);
    e.color.setPalette(Array.from({ length: MAX_PALETTE_COLORS }, () => black));
    assert.deepEqual(e.color.addPaletteColor("foreground"), { added: false, index: -1 });
    // A shortened palette hides missing colors without changing existing native indices.
    const native = { depth: 8, width: 1, height: 1, data: new Uint8Array([255]) };
    const shortPalette = paletteForColors([black]);
    const projected = expandAsepriteSamples(native, shortPalette, 0);
    assert.deepEqual(Array.from(projected), [0, 0, 0, 0]);
    assert.equal(
      encodeAsepriteSamples({ width: 1, height: 1, data: projected }, 8, shortPalette, 0, native),
      native,
    );
    e.color.setPalette([]);
    assert.equal(e.color.stepPaletteColor("foreground", 1), null);
    console.log(
      "Palette commands: Aseprite wrap/best fit, duplicate index continuity, AddColor edit semantics, no-op/full palette, transaction history and pure adapter policies pass.",
    );
  }, 60_000);
});
