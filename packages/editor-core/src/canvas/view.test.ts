import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("fit-screen", () => {
  it("fit-screen behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { fitScreenZoom, RasterEditor, executeEditorCommand, resolveShortcut } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const sprite = { width: 100, height: 100 };
    assert.equal(fitScreenZoom(1, { width: 850, height: 336 }, sprite), 3);
    assert.equal(fitScreenZoom(8, { width: 850, height: 336 }, sprite), 3);
    assert.equal(
      fitScreenZoom(1, { width: 800, height: 400 }, sprite),
      3,
      "Aseprite fit approaching exact boundary from below backs off",
    );
    assert.equal(
      fitScreenZoom(8, { width: 800, height: 400 }, sprite),
      4,
      "Aseprite fit approaching from above accepts exact boundary",
    );
    assert.equal(fitScreenZoom(4, { width: 800, height: 400 }, sprite), 4);
    assert.equal(fitScreenZoom(1, { width: 1, height: 1 }, sprite), 1 / 64);
    assert.equal(fitScreenZoom(1, { width: 100000, height: 100000 }, sprite), 64);
    assert.equal(
      fitScreenZoom(1, { width: 75, height: 700 }, sprite),
      0.5,
      "Width constrains portrait viewport",
    );
    console.log(
      "Aseprite fit-screen limiting axis, direction-sensitive exact fit, and zoom bounds pass.",
    );

    const editor = new RasterEditor({
      width: 100,
      height: 100,
      data: new Uint8ClampedArray(40000),
    });
    const context = { scene: "document", viewport: { width: 850, height: 336 } };
    editor.canvas.setView({ zoom: 8, pan: { x: 100, y: -50 } });
    executeEditorCommand(editor, resolveShortcut({ key: "0", ctrl: true }), context);
    assert.equal(editor.getSnapshot().view.zoom, 3);
    assert.deepEqual(editor.getSnapshot().view.pan, { x: 0, y: 0 });
    editor.canvas.setView({ pan: { x: 123, y: 456 } });
    executeEditorCommand(editor, resolveShortcut({ key: "Z", shift: true }), context);
    assert.equal(editor.getSnapshot().view.zoom, 3, "Scroll center preserves zoom");
    assert.deepEqual(editor.getSnapshot().view.pan, { x: 0, y: 0 });
    assert.equal(
      executeEditorCommand(editor, { type: "fit-screen" }, { ...context, scene: "home" }).kind,
      "unavailable",
    );
    console.log("Fit-screen and center shortcuts dispatch correctly and respect document context.");
  }, 60_000);
});

describe("editor-view", () => {
  it("editor-view behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/canvas/view.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { documentToScreen, screenToDocument, keepDocumentOrigin } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const origin = (viewport, document, zoom = 1, pan = { x: 0, y: 0 }) =>
      documentToScreen({ x: 0, y: 0 }, viewport, document, { zoom, pan });
    // Editor::setScrollToCenter and setScrollAndZoomToFitScreen divide viewport and
    // integer-projected canvas extents separately, truncating before subtraction.
    const cases = [
      [{ width: 850, height: 331 }, { width: 612, height: 354 }, 1, { x: 119, y: -12 }],
      [{ width: 851, height: 331 }, { width: 613, height: 355 }, 1, { x: 119, y: -12 }],
      [{ width: 850, height: 332 }, { width: 613, height: 355 }, 1, { x: 119, y: -11 }],
      [{ width: 9, height: 9 }, { width: 5, height: 7 }, 0.5, { x: 3, y: 3 }],
      [{ width: 9, height: 9 }, { width: 5, height: 7 }, 2, { x: -1, y: -3 }],
      [{ width: 9, height: 9 }, { width: 99, height: 105 }, 1 / 3, { x: -12, y: -13 }],
    ];
    for (const [viewport, document, zoom, expected] of cases)
      assert.deepEqual(origin(viewport, document, zoom), expected);
    // Same client region painted at backing-store scale 2 has an even pixel
    // origin. Rounding only after upscaling incorrectly centers this one pixel down.
    assert.equal(origin({ width: 850, height: 331 }, { width: 612, height: 354 }).y * 2, -24);
    for (const [viewport, document, zoom] of cases) {
      const view = { zoom, pan: { x: 7.25, y: -9.5 } };
      for (const p of [
        { x: 0, y: 0 },
        { x: 12.75, y: -3.5 },
        { x: 100.5, y: 77.25 },
      ]) {
        const round = screenToDocument(
          documentToScreen(p, viewport, document, view),
          viewport,
          document,
          view,
        );
        assert.ok(Math.abs(round.x - p.x) < 1e-10);
        assert.ok(Math.abs(round.y - p.y) < 1e-10);
      }
    }
    // KeepOrigin must use the same integer viewport-center convention; alternating
    // odd/even viewport changes must neither jump the artwork nor accumulate drift.
    const doc = { width: 613, height: 355 },
      sizes = [
        { width: 850, height: 331 },
        { width: 850, height: 448 },
        { width: 851, height: 449 },
        { width: 850, height: 331 },
      ];
    let pan = { x: 3, y: -7 };
    const initial = origin(sizes[0], doc, 1, pan);
    for (let i = 1; i < sizes.length; i++) {
      pan = keepDocumentOrigin(sizes[i - 1], sizes[i], pan);
      assert.deepEqual(origin(sizes[i], doc, 1, pan), initial);
    }
    assert.deepEqual(pan, { x: 3, y: -7 });
    console.log(
      "Viewport tests pass: integer scene centering, odd/even and minified canvas sizes, scale2 origin, continuous coordinate inverses, and KeepOrigin resize roundtrips.",
    );
  }, 60_000);
});

describe("assistance-view [feature-7-12]", () => {
  it("assistance-view behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/canvas/view.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const api = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    for (const mode of [0, 1, 2, 3])
      for (const zoom of [1 / 3, 1 / 2, 1, 2, 3])
        for (const doc of [
          { width: 8, height: 7 },
          { width: 13, height: 9 },
        ]) {
          const viewport = { width: 301, height: 201 },
            view = { zoom, pan: { x: 7, y: -3 }, tiledMode: mode },
            expanded = {
              width: doc.width * (mode & 1 ? 3 : 1),
              height: doc.height * (mode & 2 ? 3 : 1),
            },
            main = { x: mode & 1 ? doc.width : 0, y: mode & 2 ? doc.height : 0 };
          for (const point of [
            { x: 0, y: 0 },
            { x: -doc.width, y: 0 },
            { x: doc.width * 1.5, y: doc.height * 1.5 },
          ]) {
            const actual = api.documentToScreen(point, viewport, doc, view),
              expected = api.documentToScreen(
                { x: point.x + main.x, y: point.y + main.y },
                viewport,
                expanded,
                { ...view, tiledMode: 0 },
              );
            assert.deepEqual(actual, expected);
            const back = api.screenToDocument(actual, viewport, doc, view);
            assert.ok(Math.abs(back.x - point.x) < 1e-10 && Math.abs(back.y - point.y) < 1e-10);
          }
          const anchor = { x: 37, y: 40 };
          assert.deepEqual(
            api.libreSpriteZoomAtAnchor(4, viewport, doc, view, anchor),
            api.libreSpriteZoomAtAnchor(4, viewport, expanded, { ...view, tiledMode: 0 }, anchor),
          );
        }
    console.log(
      "Tiled canvas centering, document inverse, neighbor-tile anchors and fractional zoom verified.",
    );
  }, 60_000);
});

describe("paste-placement", () => {
  it("paste-placement behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const {
      documentPastePosition: pastePosition,
      libreSpriteViewportDocumentBounds: bounds,
      RasterEditor,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const view = (zoom = 1, x = 0, y = 0) => ({ zoom, pan: { x, y } });
    // Source integers: origin119,-12; negative lower edge remove(-119)=-120.
    assert.deepEqual(bounds({ width: 850, height: 331 }, { width: 612, height: 354 }, view()), {
      x: -120,
      y: 12,
      width: 851,
      height: 331,
    });
    assert.deepEqual(
      pastePosition(
        { width: 7, height: 7 },
        { width: 612, height: 354 },
        { width: 850, height: 331 },
        view(),
      ),
      { x: 303, y: 174 },
    );
    // At2x with pan200px left, visible sprite is [175,200), not the doc center.
    assert.deepEqual(
      pastePosition(
        { width: 10, height: 10 },
        { width: 200, height: 100 },
        { width: 100, height: 100 },
        view(2, -200, 0),
      ),
      { x: 182, y: 45 },
    );
    // Small document almost panned offscreen: intersect before centering.
    assert.deepEqual(
      pastePosition(
        { width: 3, height: 3 },
        { width: 20, height: 20 },
        { width: 100, height: 100 },
        view(1, 45, 0),
      ),
      { x: 6, y: 9 },
    );
    // No visible intersection yields source emptyRect(), then viewport recenter and
    // final one-pixel-overlap clamp (no invisible default text far offscreen).
    assert.deepEqual(
      pastePosition(
        { width: 3, height: 3 },
        { width: 20, height: 20 },
        { width: 100, height: 100 },
        view(1, 500, 0),
      ),
      { x: -2, y: -1 },
    );
    // Either oversized dimension triggers both inside-sprite clamps.
    assert.deepEqual(
      pastePosition(
        { width: 25, height: 3 },
        { width: 20, height: 20 },
        { width: 100, height: 100 },
        view(1, 500, 0),
      ),
      { x: 0, y: 0 },
    );
    assert.deepEqual(
      pastePosition(
        { width: 5, height: 7 },
        { width: 101, height: 99 },
        { width: 31, height: 33 },
        view(0.5),
      ),
      { x: 49, y: 46 },
    );
    // Public controller preserves color parameter and places in the panned visible region.
    const e = new RasterEditor({
      width: 200,
      height: 100,
      data: new Uint8ClampedArray(200 * 100 * 4),
    });
    e.drawing.settings.setSettings({
      font: {
        height: 10,
        lineHeight: 10,
        glyphs: {
          X: {
            width: 10,
            height: 10,
            advance: 10,
            alpha: new Uint8Array(100).fill(255),
          },
        },
      },
    });
    e.canvas.setView(view(2, -200, 0));
    assert.equal(
      e.drawing.text.beginTextPasteInViewport(
        "X",
        1,
        { width: 100, height: 100 },
        [255, 0, 0, 255],
      ),
      true,
    );
    assert.equal(e.getSnapshot().floatingPaste.x, 182);
    assert.equal(e.getSnapshot().floatingPaste.y, 45);
    assert.equal(e.getSnapshot().floatingPaste.pixels.data[0], 255);
    assert.equal(e.getSnapshot().canUndo, false);
    console.log(
      "Paste placement checks pass: negative projection edges, odd extents, panned/zoomed intersection centering, offscreen and oversized clamps, minification, controller API/color delegation.",
    );
  }, 60_000);
});
