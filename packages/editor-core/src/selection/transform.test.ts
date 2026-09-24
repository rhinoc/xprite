import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("selection-transform", () => {
  it("selection-transform behavior", async () => {
    const compiled = await build({
      entryPoints: [
        "packages/editor-core/src/index.ts",
        "packages/editor-core/src/selection/transform.ts",
      ],
      bundle: true,
      platform: "node",
      format: "esm",
      outdir: "unused",
      write: false,
    });
    const modules = await Promise.all(
      compiled.outputFiles.map(
        (f) => import(`data:text/javascript;base64,${Buffer.from(f.contents).toString("base64")}`),
      ),
    );
    const { RasterEditor } = modules.find((m) => m.RasterEditor),
      { rasterizeSelectionTransform, dragSelectionTransform } = modules.find(
        (m) => m.rasterizeSelectionTransform,
      );
    const {
      selectionBoundarySegments,
      projectSelectionBoundarySegments,
      asepriteSelectionBoundaryWhite,
      selectionShaderOffset,
      asepriteSelectionHandleRect,
    } = modules.find((m) => m.selectionBoundarySegments);
    const {
      createAsepriteSelectionAntsState,
      syncAsepriteSelectionAnts,
      requestAsepriteSelectionAntsTick,
      paintAsepriteSelectionAnts,
    } = modules.find((m) => m.createAsepriteSelectionAntsState);
    const fullMask = {
      x: 10,
      y: 20,
      width: 2,
      height: 2,
      data: new Uint8Array([255, 255, 255, 255]),
    };
    const antsSegments = selectionBoundarySegments(fullMask);
    assert.deepEqual(
      antsSegments.map(({ axis, x, y, length }) => [axis, x, y, length]),
      [
        ["horizontal", 10, 20, 2],
        ["horizontal", 10, 22, 2],
        ["vertical", 10, 20, 2],
        ["vertical", 12, 20, 2],
      ],
    );
    assert.deepEqual(
      projectSelectionBoundarySegments(antsSegments, { x: 3, y: 4 }, 2).map(
        ({ axis, x, y, length }) => [axis, x, y, length],
      ),
      [
        ["horizontal", 23, 44, 4],
        ["horizontal", 23, 48, 4],
        ["vertical", 23, 44, 4],
        ["vertical", 27, 44, 4],
      ],
    );
    assert.deepEqual(
      Array.from({ length: 8 }, (_, x) => asepriteSelectionBoundaryWhite(x, 0, 0)),
      [false, true, true, true, true, false, false, false],
    );
    assert.deepEqual(
      Array.from({ length: 8 }, (_, x) => asepriteSelectionBoundaryWhite(x, 0, 7)),
      [true, true, true, true, false, false, false, false],
    );
    for (let phase = 0; phase < 8; phase++)
      for (let x = 0; x < 8; x++)
        assert.equal(asepriteSelectionBoundaryWhite(x, 0, phase), ((x + 7 - phase) & 7) < 4);
    assert.deepEqual(asepriteSelectionHandleRect(10, 10, 5, 0), {
      x: 10,
      y: 8,
      width: 5,
      height: 5,
    });
    let ants = syncAsepriteSelectionAnts(createAsepriteSelectionAntsState(), true);
    assert.equal(ants.offset, 0);
    ants = requestAsepriteSelectionAntsTick(ants);
    let paintedAnts = paintAsepriteSelectionAnts(ants);
    assert.deepEqual([paintedAnts.phase, paintedAnts.state.offset], [0, 1]);
    ants = syncAsepriteSelectionAnts(paintedAnts.state, false);
    ants = syncAsepriteSelectionAnts(ants, true);
    assert.equal(ants.offset, 1, "Paused mask keeps its offset without wall-clock catch-up");
    paintedAnts = paintAsepriteSelectionAnts(requestAsepriteSelectionAntsTick(ants));
    assert.deepEqual([paintedAnts.phase, paintedAnts.state.offset], [1, 2]);
    const image = { width: 10, height: 10, data: new Uint8ClampedArray(400) };
    image.data.set([255, 0, 0, 255], (3 * 10 + 3) * 4);
    image.data.set([0, 255, 0, 255], (3 * 10 + 4) * 4);
    const editor = new RasterEditor(image);
    editor.drawing.settings.setSettings({ tool: "marquee" });
    editor.pointerDown({ x: 3, y: 3 });
    editor.pointerUp({ x: 4, y: 4 });
    assert.equal(editor.getSnapshot().dirty, false);
    editor.pointerDown({ x: 3, y: 3 });
    editor.pointerUp({ x: 5, y: 5 });
    assert(editor.getSnapshot().selectionTransform);
    assert.equal(editor.getSnapshot().floatingPaste.x, 5);
    assert.equal(editor.canvas.composite().data[(3 * 10 + 3) * 4 + 3], 0);
    editor.clipboard.commitFloatingPaste();
    assert.deepEqual(
      Array.from(editor.canvas.composite().data.slice((5 * 10 + 5) * 4, (5 * 10 + 5) * 4 + 4)),
      [255, 0, 0, 255],
    );
    assert.equal(editor.getSnapshot().document.selection.x, 5);
    editor.history.undo();
    assert.deepEqual(editor.canvas.composite().data, image.data);
    editor.history.redo();
    assert.equal(editor.canvas.composite().data[(5 * 10 + 5) * 4], 255);
    editor.history.undo();
    editor.pointerDown({ x: 3, y: 3 });
    editor.pointerUp({ x: 8, y: 8 });
    editor.clipboard.cancelFloatingPaste();
    assert.deepEqual(editor.canvas.composite().data, image.data);
    editor.pointerDown({ x: 3, y: 3, ctrl: true });
    editor.pointerUp({ x: 6, y: 6 });
    editor.clipboard.commitFloatingPaste();
    assert.equal(editor.canvas.composite().data[(3 * 10 + 3) * 4], 255);
    assert.equal(editor.canvas.composite().data[(6 * 10 + 6) * 4], 255);
    editor.history.undo();
    editor.pointerDown({ x: 3, y: 3, button: 2 });
    editor.pointerUp({ x: 5, y: 5, button: 2 });
    assert.equal(editor.getSnapshot().selectionTransform, null);
    assert.deepEqual(editor.canvas.composite().data, image.data);
    const source = {
        width: 2,
        height: 1,
        data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]),
      },
      mask = { x: 0, y: 0, width: 2, height: 1, data: new Uint8Array([255, 255]) };
    const transform = {
      source,
      mask,
      bounds: { x: 0, y: 0, width: 2, height: 1 },
      angle: 0,
      copy: false,
    };
    const scaled = rasterizeSelectionTransform({
      ...transform,
      bounds: { x: 1, y: 2, width: 4, height: 2 },
    });
    assert.deepEqual(
      [scaled.mask.x, scaled.mask.y, scaled.pixels.width, scaled.pixels.height],
      [1, 2, 4, 2],
    );
    assert.deepEqual(
      Array.from(scaled.pixels.data.slice(0, 16)),
      [255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255],
    );
    const rotated = rasterizeSelectionTransform({
      ...transform,
      bounds: { x: 0, y: 0, width: 2, height: 2 },
      source: {
        width: 2,
        height: 2,
        data: new Uint8ClampedArray([
          255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
        ]),
      },
      mask: { x: 0, y: 0, width: 2, height: 2, data: new Uint8Array(4).fill(255) },
      angle: Math.PI / 2,
    });
    assert.deepEqual(Array.from(rotated.pixels.data.slice(0, 8)), [0, 0, 255, 255, 255, 0, 0, 255]);
    assert.equal(
      dragSelectionTransform(transform, "e", { x: 2, y: 0 }, { x: 4, y: 0 }).bounds.width,
      4,
    );
    const font = {
      height: 1,
      lineHeight: 1,
      glyphs: {
        A: { width: 1, height: 1, advance: 1, alpha: new Uint8Array([255]) },
      },
    };
    editor.drawing.settings.setSettings({ tool: "text", font, foreground: [50, 60, 70, 255] });
    editor.pointerDown({ x: 1, y: 1 });
    editor.pointerUp({ x: 2, y: 2 });
    assert(editor.getSnapshot().inlineText);
    editor.drawing.text.updateInlineText({ text: "A", selectionStart: 1, selectionEnd: 1 });
    const selected = editor.getSnapshot().document.selection;
    assert(editor.drawing.text.commitInlineText());
    assert.deepEqual(Array.from(editor.canvas.composite().data.slice(44, 48)), [50, 60, 70, 255]);
    assert.equal(editor.getSnapshot().document.selection, selected);
    editor.history.undo();
    assert.equal(editor.canvas.composite().data[47], 0);
    editor.history.redo();
    assert.equal(editor.canvas.composite().data[47], 255);
    assert.equal(editor.getSnapshot().document.selection, selected);
    const beforeBounds = editor.canvas.composite().data.slice(),
      dirty = editor.getSnapshot().dirty;
    editor.drawing.settings.setSettings({ tool: "marquee" });
    editor.selection.beginTransform("bounds", { x: 3, y: 3 });
    editor.pointerUp({ x: 5, y: 6 });
    assert.deepEqual(editor.canvas.composite().data, beforeBounds);
    assert.equal(editor.getSnapshot().dirty, dirty);
    editor.color.setPalette([
      [1, 2, 3, 255],
      [4, 5, 6, 255],
    ]);
    editor.document.close();
    assert.deepEqual(editor.getSnapshot().palette, [
      [1, 2, 3, 255],
      [4, 5, 6, 255],
    ]);
    assert.equal(editor.getSnapshot().document, null);
    assert.equal(editor.getSnapshot().canUndo, false);
    assert.equal(editor.getSnapshot().inlineText, null);
    console.log(
      "Selection cut/copy/translation/cancel/undo/redo/right drag; nearest scale/rotation; marching-ants all-8-phase pattern/segments/timer lifecycle; Aseprite handle midpoint; inline text commit/history/selection; close lifecycle pass.",
    );

    // Independent source inventory: viewport (83,49), AppEditor (-171,-149)
    // for 509x396 at 100%, confirming scroll-relative shader origin (254,198).
    assert.deepEqual(
      selectionShaderOffset({ width: 850, height: 336 }, { width: 509, height: 396 }, 1, {
        x: 171,
        y: -30,
      }),
      { x: 254, y: 198 },
    );
    assert.deepEqual(
      selectionShaderOffset({ width: 850, height: 336 }, { width: 509, height: 396 }, 1, {
        x: 181,
        y: -25,
      }),
      { x: 244, y: 193 },
    );
    assert.deepEqual(
      selectionShaderOffset({ width: 850, height: 336 }, { width: 105, height: 86 }, 1, {
        x: 372,
        y: 125,
      }),
      { x: 373, y: 125 },
    );
  }, 60_000);
});
