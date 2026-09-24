import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("selection-operations [feature-1-6]", () => {
  it("selection-operations behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/selection/operations.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const s = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const { outputFiles: celContentFiles } = await build({
      entryPoints: ["packages/editor-core/src/selection/cel-content.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const celContent = await import(
      `data:text/javascript;base64,${Buffer.from(celContentFiles[0].contents).toString("base64")}`
    );
    const count = (m) => m?.data.reduce((a, b) => a + (b ? 1 : 0), 0) ?? 0;
    const a = s.rectangleSelection({ x: 1, y: 1 }, { x: 3, y: 3 }, 8, 8),
      b = s.rectangleSelection({ x: 3, y: 1 }, { x: 5, y: 3 }, 8, 8);
    assert.equal(count(s.combineSelection(a, b, "add", 8, 8)), 15);
    assert.ok(
      [...s.combineSelection(a, b, "add", 8, 8).data].every((v) => v === 0 || v === 1),
      "Aseprite IMAGE_BITMAP output uses binary bits, not alpha coverage",
    );
    assert.equal(count(s.combineSelection(a, b, "subtract", 8, 8)), 6);
    assert.equal(count(s.combineSelection(a, b, "intersect", 8, 8)), 3);
    assert.equal(count(s.combineSelection(a, b, "replace", 8, 8)), 9);
    assert.equal(s.combineSelection(a, null, "intersect", 8, 8), null);
    assert.equal(s.selectionModeForInput("replace", { shift: true, alt: true }), "subtract");
    assert.equal(s.selectionModeForInput("replace", { shift: true, ctrl: true }), "intersect");
    assert.equal(
      s.selectionModeForInput("replace", { shift: true, alt: true, ctrl: true }),
      "subtract",
      "Aseprite subtract priority wins loose action flags",
    );
    assert.equal(
      s.selectionModeForInput("replace", { alt: true }),
      "replace",
      "Alt alone is not subtract in Aseprite",
    );
    assert.equal(
      s.selectionModeForInput("add", { button: 2, shift: true, ctrl: true }),
      "subtract",
      "Secondary selection ink always subtracts",
    );
    assert.equal(
      s.selectionModeForInput("intersect", {}),
      "intersect",
      "Unmodified pointer retains selected context-bar mode",
    );
    assert.equal(count(s.modifySelection(a, "contract", 1, "square", 8, 8)), 1);
    assert.equal(
      count(s.modifySelection(a, "border", 1, "square", 8, 8)),
      8,
      "Aseprite border remains inside original selection",
    );
    assert.equal(count(s.modifySelection(a, "expand", 1, "square", 8, 8)), 25);
    assert.equal(
      count(
        s.modifySelection(
          s.rectangleSelection({ x: 0, y: 0 }, { x: 0, y: 0 }, 8, 8),
          "expand",
          1,
          "square",
          8,
          8,
        ),
      ),
      4,
      "Expansion clips at canvas edges",
    );
    assert.equal(
      count(s.modifySelection(a, "expand", 1, "circle", 8, 8)),
      21,
      "Aseprite 3x3 ellipse kernel has no corner pixels",
    );
    const buffer = {
      width: 3,
      height: 2,
      data: new Uint8ClampedArray([
        255, 0, 0, 255, 0, 0, 0, 255, 255, 0, 0, 255, 255, 1, 0, 255, 0, 0, 0, 255, 255, 0, 0, 255,
      ]),
    };
    assert.equal(count(s.magicWandSelection(buffer, { x: 0, y: 0 }, 0, true)), 1);
    assert.equal(count(s.magicWandSelection(buffer, { x: 0, y: 0 }, 1, true)), 2);
    assert.equal(count(s.magicWandSelection(buffer, { x: 0, y: 0 }, 0, false)), 3);
    assert.equal(count(s.colorRangeSelection(buffer, [255, 0, 0, 255], 1)), 4);
    const hidden = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 0, 0, 255, 0, 0]),
    };
    assert.equal(
      count(s.magicWandSelection(hidden, { x: 0, y: 0 })),
      2,
      "Wand treats transparent hidden RGB as equal",
    );
    assert.equal(
      count(s.colorRangeSelection(hidden, [255, 0, 0, 0])),
      1,
      "Color range tests all RGBA channels like Aseprite Mask::byColor",
    );
    const rasterCel = {
      cel: {
        pixels: {
          width: 3,
          height: 2,
          data: new Uint8ClampedArray(24),
        },
        x: 7,
        y: 9,
        asepritePixels: new Uint8Array([0, 0, 2, 0, 0, 0]),
      },
      layer: { kind: "image", background: false },
      colorDepth: 8,
      transparentIndex: 0,
    };
    assert.equal(celContent.canSelectCelContent(rasterCel), true);
    assert.deepEqual(celContent.celContentSelection(rasterCel), {
      x: 9,
      y: 9,
      width: 1,
      height: 1,
      data: new Uint8Array([255]),
    });
    const tilePixels = new Uint8Array(32);
    tilePixels[16 + 3] = 255;
    const tileCel = {
      cel: {
        pixels: { width: 6, height: 2, data: new Uint8ClampedArray(48) },
        x: 10,
        y: 20,
        tilemap: {
          width: 3,
          height: 1,
          tileWords: new Uint32Array([0, 1, 0]),
          tileIndexMask: 0x1fffffff,
        },
      },
      layer: { kind: "tilemap", background: false },
      colorDepth: 32,
      tileset: {
        tileWidth: 2,
        tileHeight: 2,
        tileCount: 2,
        pixels: tilePixels,
      },
    };
    assert.equal(celContent.canSelectCelContent(tileCel), true);
    assert.deepEqual(celContent.celContentSelection(tileCel), {
      x: 12,
      y: 20,
      width: 2,
      height: 2,
      data: new Uint8Array(4).fill(255),
    });
    assert.equal(
      celContent.canSelectCelContent({ ...tileCel, layer: { ...tileCel.layer, background: true } }),
      false,
    );
    assert.equal(
      celContent.canSelectCelContent({
        ...tileCel,
        tileset: { ...tileCel.tileset, pixels: new Uint8Array(1) },
      }),
      false,
    );
    const indexedBackground = {
      cel: {
        pixels: { width: 2, height: 1, data: new Uint8ClampedArray(8) },
        x: 0,
        y: 0,
        asepritePixels: new Uint8Array([3, 4]),
      },
      layer: { kind: "image", background: true },
      colorDepth: 8,
      transparentIndex: 0,
    };
    assert.deepEqual(celContent.celContentSelection(indexedBackground, { index: 3 }), {
      x: 1,
      y: 0,
      width: 1,
      height: 1,
      data: new Uint8Array([255]),
    });
    for (let width = 1; width <= 30; width++)
      for (let height = 1; height <= 30; height++) {
        const ellipse = s.ellipseSelection(
          { x: 0, y: 0 },
          { x: width - 1, y: height - 1 },
          width,
          height,
        );
        assert.ok(ellipse && count(ellipse) > 0);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            assert.equal(
              s.selectionContains(ellipse, x, y),
              s.selectionContains(ellipse, width - 1 - x, y),
              `horizontal symmetry ${width}x${height}`,
            );
            assert.equal(
              s.selectionContains(ellipse, x, y),
              s.selectionContains(ellipse, x, height - 1 - y),
              `vertical symmetry ${width}x${height}`,
            );
          }
      }
    console.log(
      "Selection operations: combinations, Aseprite inside border, circle/square morphology, tolerance, transparency, 900 ellipse sizes passed",
    );
  }, 60_000);
});

describe("selection-command-review [feature-1-6]", () => {
  it("selection-command-review behavior", async () => {
    const compile = async (file) => {
      const { outputFiles } = await build({
        entryPoints: [file],
        bundle: true,
        format: "esm",
        write: false,
      });
      return import(
        `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
      );
    };
    const { RasterEditor, resolveShortcut, executeEditorCommand } = await compile(
      "packages/editor-core/src/index.ts",
    );
    const image = () => ({ width: 8, height: 8, data: new Uint8ClampedArray(256) });
    const celPixels = new Uint8ClampedArray(6 * 5 * 4);
    celPixels.set([12, 34, 56, 255], (2 * 6 + 3) * 4);
    const celEditor = new RasterEditor({ width: 6, height: 5, data: celPixels });
    assert.equal(celEditor.selection.canSelectCelContent(), true);
    assert.equal(celEditor.selection.selectCelContent(), true);
    assert.deepEqual(celEditor.getSnapshot().document.selection, {
      x: 3,
      y: 2,
      width: 1,
      height: 1,
      data: new Uint8Array([255]),
    });
    assert.equal(celEditor.getSnapshot().settings.tool, "marquee");
    const e = new RasterEditor(image());
    assert.equal(new RasterEditor().selection.canColorRange(), false);
    assert.equal(e.selection.canColorRange(), true);
    e.timeline.setLayerLocked(true);
    e.timeline.setLayerVisible(false);
    assert.equal(
      e.selection.canColorRange(),
      true,
      "Aseprite MaskByColor needs image, not layer visibility/editability",
    );
    e.timeline.addLayer();
    assert.equal(e.selection.canSelectCelContent(), false, "Empty active cels cannot be selected");
    assert.equal(
      e.selection.canColorRange(),
      false,
      "Empty active cel is not a Aseprite HasActiveImage",
    );
    e.document.loadImage(image());
    e.drawing.settings.setSettings({ tool: "marquee" });
    e.pointerDown({ x: 1, y: 1 });
    e.pointerUp({ x: 3, y: 3 });
    const committed = e.getSnapshot().document.selection,
      before = e.canvas.composite(),
      pixels = before.data.slice(),
      persistence = e.getPersistenceSnapshot(),
      revision = e.getSnapshot().persistenceRevision,
      undo = e.getSnapshot().canUndo;
    for (const tolerance of [0, 15, 64, 255])
      for (const mode of ["replace", "add", "subtract", "intersect"]) {
        e.selection.previewColorRange({ color: [0, 0, 0, 0], tolerance, mode, preview: true });
        assert.equal(e.getSnapshot().dirty, false);
        assert.equal(e.getSnapshot().canUndo, undo);
        assert.equal(
          e.getSnapshot().persistenceRevision,
          revision,
          "Preview must not enter recovery state",
        );
        assert.deepEqual(e.getPersistenceSnapshot(), persistence);
        assert.equal(e.canvas.composite(), before);
        assert.deepEqual(e.canvas.composite().data, pixels);
      }
    e.selection.previewColorRange({
      color: [0, 0, 0, 0],
      tolerance: 255,
      mode: "replace",
      preview: false,
    });
    assert.equal(e.getSnapshot().document.selection, committed);
    e.selection.previewColorRange(null);
    assert.equal(e.getSnapshot().document.selection, committed);
    e.history.undo();
    assert.equal(e.getSnapshot().document.selection, null, "Preview/cancel adds no history steps");
    for (const key of ["Enter", "Escape", "ArrowLeft", "m", "q", "w", "u", "d"])
      assert.equal(
        resolveShortcut({ key, editingText: true }),
        null,
        `Typing ${key} cannot execute editor command`,
      );
    const context = { scene: "document", viewport: { width: 500, height: 400 } };
    e.selection.selectAll();
    executeEditorCommand(e, { type: "cancel" }, context);
    assert.equal(e.getSnapshot().document.selection, null, "Escape deselects outside drafts");
    assert.equal(e.getSnapshot().dirty, false);
    e.document.loadImage(image());
    assert.equal(e.selection.canReselect(), false, "New document cannot inherit reselect");
    for (const tool of [
      "marquee",
      "lasso",
      "elliptical_marquee",
      "polygonal_lasso",
      "magic_wand",
    ]) {
      const ed = new RasterEditor(image());
      ed.selection.selectAll();
      ed.drawing.settings.setSettings({ tool });
      const result = executeEditorCommand(
        ed,
        { type: "move-selection", dx: 1, dy: 0, boundsOnly: true, byGrid: false },
        context,
      );
      assert.equal(result.kind, "handled");
      assert.equal(
        ed.getSnapshot().document.selection.x,
        1,
        `${tool} arrows move mask rather than timeline`,
      );
      assert.equal(ed.getSnapshot().document.timeline.activeFrame, 0);
    }
    e.selection.selectAll();
    assert.equal(e.selection.canReselect(), false, "Aseprite reselect disabled while mask visible");
    const reselect = resolveShortcut({ key: "d", ctrl: true, shift: true });
    assert.deepEqual(reselect, { type: "reselect" });
    assert.equal(executeEditorCommand(e, reselect, context).kind, "unavailable");
    e.selection.deselect();
    assert.equal(e.selection.canReselect(), true);
    assert.equal(
      executeEditorCommand(e, reselect, { ...context, scene: "home" }).kind,
      "unavailable",
    );
    assert.equal(executeEditorCommand(e, reselect, context).kind, "handled");
    assert.equal(e.getSnapshot().document.selection.width, 8);
    assert.equal(e.getSnapshot().dirty, false);
    e.timeline.addLayer();
    const emptyRevision = e.getSnapshot().revision,
      emptySelection = e.getSnapshot().document.selection;
    e.selection.selectColorRange([0, 0, 0, 0]);
    assert.equal(
      e.getSnapshot().revision,
      emptyRevision,
      "Color range command on empty cel is unavailable",
    );
    assert.equal(e.getSnapshot().document.selection, emptySelection);
    console.log(
      "Selection command review: image eligibility, locked/hidden sampling, preview recovery/history/pixel isolation, text key isolation, Escape, document identity passed",
    );
  }, 60_000);
});
