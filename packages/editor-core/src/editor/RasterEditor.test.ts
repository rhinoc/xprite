import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("four-interactions", () => {
  it("four-interactions behavior", async () => {
    const { outputFiles } = await build({
      stdin: {
        contents:
          'export * from "./packages/editor-core/src/index.ts";export * from "./apps/editor/src/managers/input/policies/auto-scroll.ts";',
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const m = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const image = () => ({ width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4) });
    for (const tool of ["marquee", "elliptical_marquee"]) {
      const e = new m.RasterEditor(image());
      e.drawing.settings.setSettings({ tool });
      e.pointerDown({ x: 20, y: 20 });
      e.pointerMove({ x: 30, y: 25, shift: true });
      let preview = e.selection.preview();
      assert.equal(preview.width, preview.height, tool + " Shift constrains aspect during drag");
      e.pointerUp({ x: 30, y: 25, shift: true });
      assert.deepEqual(e.getSnapshot().document.selection, preview);
      e.history.undo();
      assert.equal(e.getSnapshot().document.selection, null);
      e.pointerDown({ x: 20, y: 20 });
      e.pointerMove({ x: 30, y: 25, physicalCtrl: true });
      preview = e.selection.preview();
      assert.deepEqual([preview.x, preview.y, preview.width, preview.height], [10, 15, 21, 11]);
      e.cancelGesture();
      e.pointerDown({ x: 20, y: 20 });
      e.pointerMove({ x: 30, y: 25 });
      e.pointerMove({ x: 35, y: 28, space: true });
      preview = e.selection.preview();
      assert.deepEqual([preview.x, preview.y, preview.width, preview.height], [25, 23, 11, 6]);
      e.pointerUp({ x: 35, y: 28, space: true });
      assert.deepEqual(e.getSnapshot().document.selection, preview);
      e.selection.deselect();
      e.pointerDown({ x: 20, y: 20, shift: true });
      e.pointerMove({ x: 30, y: 25, shift: true });
      assert.equal(e.selection.preview().width, 11, "Held Shift adds but does not constrain");
      e.pointerMove({ x: 30, y: 25, shift: false });
      e.pointerMove({ x: 30, y: 25, shift: true });
      assert.equal(e.selection.preview().width, 6, "Release/repress enables aspect");
      e.cancelGesture();
    }
    for (const [prev, at, want] of [
      [
        { x: 50, y: 50 },
        { x: -10, y: 50 },
        { x: 60, y: 0 },
      ],
      [
        { x: 50, y: 50 },
        { x: 110, y: 50 },
        { x: -60, y: 0 },
      ],
      [
        { x: 50, y: 50 },
        { x: 50, y: -10 },
        { x: 0, y: 60 },
      ],
      [
        { x: 50, y: 50 },
        { x: 50, y: 110 },
        { x: 0, y: -60 },
      ],
      [
        { x: 110, y: 110 },
        { x: 105, y: 105 },
        { x: 0, y: 0 },
      ],
      [
        { x: 110, y: 110 },
        { x: 110, y: 110 },
        { x: 0, y: 0 },
      ],
    ])
      assert.deepEqual(
        m.canvasAutoScroll(prev, at, { x: 0, y: 0 }, { width: 100, height: 100 }).pan,
        want,
      );
    const e = new m.RasterEditor(image());
    e.drawing.settings.setSettings({ foreground: [255, 0, 0, 255] });
    e.pointerDown({ x: 0, y: 0 });
    e.pointerUp();
    e.timeline.setLayerContinuous(true);
    e.timeline.addFrame();
    e.timeline.selectFrame(0);
    e.timeline.setCelProperties({ opacity: 128, zIndex: 2 });
    let t = e.getSnapshot().document.timeline;
    assert.equal(t.frames[0].cels[0].opacity, 128);
    assert.equal(t.frames[1].cels[0].opacity, 128, "Linked data opacity propagates");
    assert.equal(t.frames[1].cels[0].zIndex, 0, "Linked z-index remains per cel");
    assert.equal(e.canvas.composite().data[3], 128);
    e.history.undo();
    assert.equal(e.getSnapshot().document.timeline.frames[0].cels[0].opacity, 255);
    e.history.redo();
    assert.equal(e.getSnapshot().document.timeline.frames[0].cels[0].zIndex, 2);
    e.timeline.setCelProperties({ zIndex: 999999 }, { kind: "cels", frames: [0, 1], layers: [0] });
    assert.ok(e.getSnapshot().document.timeline.frames.every((f) => f.cels[0].zIndex === 32767));
    const doc = e.getSnapshot().document;
    const bytes = await m.encodeAseprite(
      m.asepriteFromProject({
        image: { width: doc.width, height: doc.height, data: e.canvas.exportComposite().data },
        timeline: doc.timeline,
      }),
    );
    const reopened = m.projectFromAseprite(await m.decodeAseprite(bytes));
    assert.equal(reopened.timeline.frames[1].cels[0].opacity, 128);
    assert.equal(reopened.timeline.frames[1].cels[0].zIndex, 32767);
    e.timeline.addFrame(false);
    e.timeline.setCelProperties({ opacity: 10, zIndex: 3 });
    assert.equal(
      e.getSnapshot().document.timeline.frames[1].cels[0],
      null,
      "Empty cel remains empty",
    );
    e.timeline.selectFrame(0);
    e.sprite.convertLayerBackground(true);
    e.timeline.setCelProperties({ opacity: 0 });
    assert.equal(
      e.getSnapshot().document.timeline.frames[0].cels[0].opacity,
      255,
      "Background opacity protected",
    );
    console.log(
      "Four-interaction core checks: marquee/ellipse modifiers and previews, auto-scroll direction/limits, cel linked opacity/per-cel z-index, undo/redo, empty/background constraints and ASE roundtrip passed",
    );
  }, 60_000);
});

describe("brush-preferences", () => {
  it("brush-preferences behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { RasterEditor } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const image = { width: 8, height: 8, data: new Uint8ClampedArray(256) },
      e = new RasterEditor(image);
    assert.deepEqual(e.getSnapshot().settings.brush, {
      shape: "circle",
      size: 1,
      angle: 0,
    });
    e.drawing.settings.setSettings({ brush: { shape: "square", size: 5, angle: 30 } });
    e.drawing.settings.setSettings({ tool: "eraser" });
    assert.deepEqual(e.getSnapshot().settings.brush, {
      shape: "circle",
      size: 8,
      angle: 0,
    });
    e.drawing.settings.setSettings({ brush: { shape: "line", size: 3, angle: 45 } });
    e.drawing.settings.setSettings({ tool: "blur" });
    assert.deepEqual(e.getSnapshot().settings.brush, {
      shape: "circle",
      size: 16,
      angle: 0,
    });
    e.drawing.settings.setSettings({ tool: "pencil" });
    assert.deepEqual(e.getSnapshot().settings.brush, {
      shape: "square",
      size: 5,
      angle: 30,
    });
    e.drawing.settings.setSettings({ tool: "eraser" });
    assert.deepEqual(e.getSnapshot().settings.brush, {
      shape: "line",
      size: 3,
      angle: 45,
    });
    e.drawing.settings.setSettings({
      tool: "line",
      brush: { shape: "square", size: 1000, angle: 60 },
    });
    assert.equal(e.getSnapshot().settings.brush.size, 64);
    e.drawing.settings.setSettings({ tool: "pencil" });
    e.drawing.settings.setSettings({ tool: "line" });
    assert.deepEqual(e.getSnapshot().settings.brush, {
      shape: "square",
      size: 64,
      angle: 60,
    });
    e.drawing.settings.setSettings({ foreground: [1, 2, 3, 255] });
    assert.equal(e.getSnapshot().settings.brush.size, 64);
    e.document.loadImage(image);
    e.drawing.settings.setSettings({ tool: "pencil" });
    assert.equal(e.getSnapshot().settings.brush.size, 5);
    assert.equal(e.getSnapshot().dirty, false);
    assert.equal(e.getSnapshot().canUndo, false);
    console.log(
      "Core brush preferences pass: source pencil/eraser/blur defaults, independent shape/size/angle banks, explicit combined patches, sizebounds, unrelatedsettings and document-load retention.",
    );
  }, 60_000);
});

describe("eyedropper-preferences", () => {
  it("eyedropper-preferences behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { RasterEditor, applyEyedropperChannel: apply } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const current = [10, 20, 30, 77],
      picked = [100, 120, 140, 128];
    assert.deepEqual(apply(current, picked, "rgba"), picked);
    assert.deepEqual(apply(current, picked, "color-alpha"), picked);
    assert.deepEqual(apply(current, picked, "rgb"), [100, 120, 140, 77]);
    assert.deepEqual(apply(current, picked, "color"), [100, 120, 140, 77]);
    assert.deepEqual(apply(current, picked, "alpha"), [10, 20, 30, 128]);
    assert.deepEqual(apply(current, [199, 188, 177, 0], "rgb"), current);
    assert.deepEqual(apply(current, [199, 188, 177, 0], "alpha"), [10, 20, 30, 0]);
    const image = { width: 4, height: 4, data: new Uint8ClampedArray(64) };
    image.data.set(picked, (1 * 4 + 1) * 4);
    const e = new RasterEditor(image);
    assert.equal(e.getSnapshot().settings.eyedropperChannel, "color-alpha");
    assert.equal(e.getSnapshot().settings.eyedropperSample, "all-layers");
    e.drawing.settings.setSettings({
      tool: "eyedropper",
      foreground: current,
      eyedropperChannel: "rgb",
    });
    e.pointerDown({ x: 1, y: 1 });
    assert.deepEqual(e.getSnapshot().settings.foreground, [100, 120, 140, 77]);
    e.drawing.settings.setSettings({ eyedropperChannel: "alpha", background: current });
    e.pointerDown({ x: 1, y: 1, button: 2 });
    assert.deepEqual(e.getSnapshot().settings.background, [10, 20, 30, 128]);
    e.timeline.setLayerVisible(false);
    e.drawing.settings.setSettings({
      eyedropperChannel: "rgba",
      eyedropperSample: "current-layer",
    });
    e.pointerDown({ x: 1, y: 1 });
    assert.deepEqual(
      e.getSnapshot().settings.foreground,
      picked,
      "Aseprite current-layer sampling reads hidden cel",
    );
    e.drawing.settings.setSettings({ eyedropperSample: "all-layers" });
    e.pointerDown({ x: 1, y: 1 });
    assert.deepEqual(e.getSnapshot().settings.foreground, [0, 0, 0, 0]);
    // Per-tool freehand settings survive switches without leaking to another tool.
    e.drawing.settings.setSettings({ tool: "pencil", pixelPerfect: true });
    e.drawing.settings.setSettings({ tool: "lasso" });
    assert.equal(e.getSnapshot().settings.pixelPerfect, false);
    e.drawing.settings.setSettings({ pixelPerfect: true });
    e.drawing.settings.setSettings({ tool: "eraser" });
    assert.equal(e.getSnapshot().settings.pixelPerfect, false);
    e.drawing.settings.setSettings({ tool: "pencil" });
    assert.equal(e.getSnapshot().settings.pixelPerfect, true);
    e.drawing.settings.setSettings({ pixelPerfect: false });
    e.drawing.settings.setSettings({ tool: "lasso" });
    assert.equal(e.getSnapshot().settings.pixelPerfect, true);
    e.drawing.settings.setSettings({ tool: "pencil" });
    assert.equal(e.getSnapshot().settings.pixelPerfect, false);
    e.document.loadImage(image);
    e.drawing.settings.setSettings({ tool: "lasso" });
    assert.equal(
      e.getSnapshot().settings.pixelPerfect,
      true,
      "Tool preferences are not document history",
    );
    console.log(
      "Eyedropper/per-tool preference checks pass: source channel/alpha rules, transparentRGB no-op, FG/BG targets, hidden active-layer vs composition, defaults and independent tool banks.",
    );
  }, 60_000);
});

describe("home-view-defaults", () => {
  it("home-view-defaults behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { RasterEditor } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const blank = () => ({ width: 8, height: 8, data: new Uint8ClampedArray(256) });
    const e = new RasterEditor(blank(), "existing");
    e.canvas.setView({ zoom: 4, pan: { x: 17, y: -3 }, appearance: "dark" });
    e.drawing.settings.setSettings({ foreground: [255, 0, 0, 255] });
    e.pointerDown({ x: 1, y: 1 });
    e.pointerUp();
    const original = e.getSnapshot(),
      pixels = e.canvas.composite(),
      history = { undo: original.canUndo, redo: original.canRedo, dirty: original.dirty };
    for (const option of [
      "grid",
      "pixelGrid",
      "selectionEdges",
      "guides",
      "layerEdges",
      "brushPreview",
    ])
      e.canvas.toggleDocumentViewOption(option, "defaults");
    let s = e.getSnapshot();
    assert.equal(s.view, original.view);
    assert.equal(s.pixelRevision, original.pixelRevision);
    assert.equal(e.canvas.composite(), pixels);
    assert.deepEqual({ undo: s.canUndo, redo: s.canRedo, dirty: s.dirty }, history);
    assert.deepEqual(s.defaultDocumentView, {
      onionSkin: undefined,
      playback: undefined,
      symmetryMode: undefined,
      symmetryX: undefined,
      symmetryY: undefined,
      tiledMode: undefined,
      gridX: undefined,
      gridY: undefined,
      snapToGrid: undefined,
      grid: true,
      pixelGrid: true,
      selectionEdges: false,
      guides: false,
      layerEdges: true,
      slices: true,
      tileNumbers: true,
      brushPreview: false,
      gridWidth: 16,
      gridHeight: 16,
    });
    assert(Object.isFrozen(s.defaultDocumentView));
    assert.equal(
      original.defaultDocumentView.grid,
      false,
      "Old snapshot keeps owned default record",
    );
    const revision = s.revision;
    e.canvas.setDocumentViewOptions({ ...s.defaultDocumentView }, "defaults");
    assert.equal(e.getSnapshot().revision, revision, "Unchanged defaults do not publish");
    e.canvas.setDocumentViewOptions({ gridWidth: 7.8, gridHeight: NaN }, "defaults");
    assert.equal(e.getSnapshot().defaultDocumentView.gridWidth, 7);
    assert.equal(e.getSnapshot().defaultDocumentView.gridHeight, 16);
    e.history.undo();
    assert.equal(e.canvas.composite().data.some(Boolean), false);
    e.history.redo();
    assert.deepEqual(e.canvas.composite().data, pixels.data);
    e.document.loadImage(blank(), "new");
    s = e.getSnapshot();
    for (const key of [
      "grid",
      "pixelGrid",
      "selectionEdges",
      "guides",
      "layerEdges",
      "slices",
      "tileNumbers",
      "brushPreview",
      "gridWidth",
      "gridHeight",
    ])
      assert.equal(s.view[key], s.defaultDocumentView[key]);
    assert.equal(s.view.appearance, "dark");
    assert.equal(s.view.zoom, 1);
    assert.deepEqual(s.view.pan, { x: 0, y: 0 });
    assert.equal(s.dirty, false);
    const defaults = s.defaultDocumentView;
    e.canvas.toggleDocumentViewOption("grid", "document");
    assert.equal(e.getSnapshot().view.grid, false);
    assert.equal(e.getSnapshot().defaultDocumentView, defaults);
    e.canvas.setDocumentViewOptions({ selectionEdges: false });
    assert.equal(e.getSnapshot().view.selectionEdges, false);
    e.selection.selectAll();
    assert.equal(
      e.getSnapshot().view.selectionEdges,
      true,
      "Aseprite auto-show restores committed selection edges after mask changes",
    );
    e.document.loadImage(blank(), "another");
    assert.equal(
      e.getSnapshot().view.grid,
      true,
      "New image uses defaults, not previous document overrides",
    );
    const empty = new RasterEditor();
    empty.canvas.toggleDocumentViewOption("grid");
    assert.equal(empty.getSnapshot().defaultDocumentView.grid, true);
    empty.canvas.toggleDocumentViewOption("grid");
    assert.equal(empty.getSnapshot().defaultDocumentView.grid, false);
    empty.document.loadImage(blank());
    assert.equal(empty.getSnapshot().view.grid, false);
    console.log(
      "Home view defaults: Aseprite-equivalent isolation/inheritance, atomic toggles, immutable snapshots, no-op publication, dimensions, preserved pixels/history/appearance and fresh viewport pass.",
    );
  }, 60_000);
});

describe("editor-sheet-preview [feature-7-12]", () => {
  it("editor-sheet-preview behavior", async () => {
    const b = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const m = await import(
      `data:text/javascript;base64,${Buffer.from(b.outputFiles[0].contents).toString("base64")}`
    );
    const source = { width: 8, height: 8, data: new Uint8ClampedArray(256) },
      sheet = { width: 24, height: 8, data: new Uint8ClampedArray(768) };
    source.data.set([40, 80, 120, 255]);
    sheet.data.fill(255);
    const core = new m.RasterEditor(source, "source.aseprite"),
      saved = core.getPersistenceSnapshot(),
      before = core.getSnapshot(),
      pixels = core.canvas.exportComposite();
    core.importExport.previewSpriteSheet(sheet);
    assert.equal(core.getSnapshot().document.width, 24);
    assert.equal(core.canvas.previewComposite().width, 24);
    assert.equal(core.canvas.exportComposite().width, 8);
    assert.equal(core.getSnapshot().dirty, false);
    assert.equal(core.getSnapshot().canUndo, before.canUndo);
    assert.equal(core.getSnapshot().persistenceRevision, before.persistenceRevision);
    assert.deepEqual(core.getPersistenceSnapshot(), saved);
    assert.deepEqual(core.canvas.exportComposite(), pixels);
    core.importExport.previewSpriteSheet(null);
    assert.equal(core.getSnapshot().document.width, 8);
    assert.deepEqual(core.canvas.previewComposite(), pixels);
    assert.equal(core.getSnapshot().persistenceRevision, before.persistenceRevision);
    core.importExport.previewSpriteSheet(sheet);
    core.document.loadImage(source, "replacement");
    assert.equal(core.canvas.previewComposite().width, 8);
    assert.equal(core.getSnapshot().document.name, "replacement");
    console.log(
      "Sprite sheet preview: display-only geometry/pixels, export/history/recovery isolation, Cancel and source replacement pass.",
    );
  }, 60_000);
});

describe("floating-text", () => {
  it("floating-text behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { RasterEditor, EditorAllocationError, resolveShortcut } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const blank = () => ({ width: 8, height: 8, data: new Uint8ClampedArray(256) });
    const font = {
      height: 2,
      lineHeight: 3,
      glyphs: {
        X: {
          width: 2,
          height: 2,
          advance: 3,
          alpha: new Uint8Array([255, 0, 0, 255]),
        },
      },
    };
    const make = () => {
      const e = new RasterEditor(blank());
      e.drawing.settings.setSettings({ font, foreground: [255, 0, 0, 128] });
      return e;
    };
    const pixel = (e, x, y) =>
      Array.from(e.canvas.composite().data.slice((y * 8 + x) * 4, (y * 8 + x) * 4 + 4));
    let e = make();
    assert.equal(e.drawing.text.beginTextPaste("X", 1), true);
    const f = e.getSnapshot().floatingPaste;
    assert.equal(f.x, 3);
    assert.equal(f.y, 3);
    assert.equal(e.getSnapshot().settings.tool, "marquee");
    assert.equal(e.getSnapshot().canUndo, false);
    assert.equal(e.getSnapshot().dirty, false);
    assert.ok(
      e.canvas.composite().data.every((v) => !v),
      "Preview does not mutate artwork",
    );
    e.pointerDown({ x: 3, y: 3 });
    e.pointerMove({ x: 5, y: 4 });
    e.pointerUp();
    assert.equal(
      e.getSnapshot().floatingPaste.pixels,
      f.pixels,
      "Drag retains immutable bitmap identity",
    );
    assert.equal(e.getSnapshot().floatingPaste.x, 5);
    assert.equal(e.getSnapshot().floatingPaste.y, 4);
    assert.ok(e.canvas.composite().data.every((v) => !v));
    assert.equal(e.clipboard.commitFloatingPaste(), true);
    assert.deepEqual(pixel(e, 5, 4), [255, 0, 0, 128]);
    assert.deepEqual(pixel(e, 6, 5), [255, 0, 0, 128]);
    assert.equal(e.getSnapshot().floatingPaste, null);
    assert.equal(e.getSnapshot().document.selection.x, 5);
    e.history.undo();
    assert.ok(e.canvas.composite().data.every((v) => !v));
    assert.equal(e.getSnapshot().document.selection, null);
    assert.equal(e.getSnapshot().canUndo, false);
    e.history.redo();
    assert.deepEqual(pixel(e, 5, 4), [255, 0, 0, 128]);
    // Preserve pre-existing selection/history/art and ignore its old clipping mask when pasting.
    e = make();
    e.drawing.settings.setSettings({ tool: "marquee" });
    e.pointerDown({ x: 0, y: 0 });
    e.pointerUp();
    const selection = e.getSnapshot().document.selection;
    const before = e.getSnapshot();
    e.drawing.text.beginTextPaste("X", 1, { x: 4, y: 4 });
    e.pointerDown({ x: 4, y: 4 });
    e.pointerMove({ x: 5, y: 5 });
    e.cancelGesture();
    assert.equal(e.getSnapshot().document.selection, selection);
    assert.equal(e.getSnapshot().canUndo, before.canUndo);
    assert.ok(e.canvas.composite().data.every((v) => !v));
    e.drawing.text.beginTextPaste("X", 1, { x: 4, y: 4 });
    e.clipboard.commitFloatingPaste();
    assert.deepEqual(pixel(e, 4, 4), [255, 0, 0, 128]);
    e.history.undo();
    assert.equal(e.getSnapshot().document.selection, selection);
    // Tool changes resolve a pending paste as one transaction. Undo during preview cancels only preview.
    e = make();
    e.drawing.text.beginTextPaste("X", 1, { x: 1, y: 1 });
    e.drawing.settings.setSettings({ tool: "pencil" });
    assert.equal(e.getSnapshot().floatingPaste, null);
    assert.deepEqual(pixel(e, 1, 1), [255, 0, 0, 128]);
    e.drawing.text.beginTextPaste("X", 1, { x: 5, y: 5 });
    e.history.undo();
    assert.deepEqual(pixel(e, 1, 1), [255, 0, 0, 128]);
    assert.ok(e.getSnapshot().canUndo);
    // Color is per insertion; brush opacity and foreground do not change it.
    e = make();
    e.drawing.settings.setSettings({ opacity: 1 });
    e.drawing.text.beginTextPaste("X", 1, { x: 1, y: 1 }, [0, 255, 0, 255]);
    e.clipboard.commitFloatingPaste();
    assert.deepEqual(pixel(e, 1, 1), [0, 255, 0, 255]);
    assert.deepEqual(e.getSnapshot().settings.foreground, [255, 0, 0, 128]);
    // Off-canvas paste survives inside the cel, and excessive union preserves the session on failure.
    e = make();
    e.drawing.text.beginTextPaste("X", 1, { x: -1, y: 0 });
    e.clipboard.commitFloatingPaste();
    assert.equal(e.getSnapshot().document.layer.x, -1);
    assert.equal(e.getSnapshot().document.layer.pixels.data[3], 128);
    e.history.undo();
    e.drawing.text.beginTextPaste("X", 1, { x: 1000000, y: 0 });
    assert.equal(e.clipboard.commitFloatingPaste(), false);
    assert.ok(e.getSnapshot().error instanceof EditorAllocationError);
    assert.ok(e.getSnapshot().floatingPaste);
    assert.equal(e.getSnapshot().canUndo, false);
    assert.ok(e.canvas.composite().data.every((v) => !v));
    e.clipboard.cancelFloatingPaste();
    assert.equal(e.getSnapshot().error, null);
    e = make();
    assert.equal(e.drawing.text.beginTextPaste("X".repeat(600), 64), false);
    assert.ok(e.getSnapshot().error instanceof EditorAllocationError);
    assert.equal(e.getSnapshot().error.operation, "text");
    assert.equal(e.getSnapshot().floatingPaste, null);
    assert.deepEqual(resolveShortcut({ key: "Enter" }), { type: "commit" });
    assert.equal(resolveShortcut({ key: "Enter", editingText: true }), null);
    console.log(
      "Floating text checks pass: immutable movable preview, source selection tool, exact one-transaction commit, prior selection restore, cancel/undo/toolchange resolution, explicit text color, offcanvas retention, allocation guards, Enter/text-input isolation.",
    );

    // PasteText checks editability, not visibility. Hidden layer text stays hidden
    // in the composite but commits to cel pixels in one undoable transaction.
    e = make();
    e.timeline.setLayerVisible(false);
    e.history.markSaved();
    const hiddenBefore = new Uint8ClampedArray(e.getSnapshot().document.layer.pixels.data);
    assert.equal(e.drawing.text.beginTextPaste("X", 1, { x: 1, y: 1 }), true);
    assert.equal(e.clipboard.commitFloatingPaste(), true);
    assert.equal(e.getSnapshot().document.layer.visible, false);
    assert.equal(e.getSnapshot().dirty, true);
    assert.ok(e.canvas.composite().data.every((v) => v === 0));
    const hiddenAfter = new Uint8ClampedArray(e.getSnapshot().document.layer.pixels.data);
    assert.notDeepEqual(hiddenAfter, hiddenBefore);
    e.history.undo();
    assert.deepEqual(e.getSnapshot().document.layer.pixels.data, hiddenBefore);
    assert.equal(e.getSnapshot().dirty, false);
    assert.equal(e.getSnapshot().document.layer.visible, false);
    e.history.redo();
    assert.deepEqual(e.getSnapshot().document.layer.pixels.data, hiddenAfter);
    assert.ok(e.canvas.composite().data.every((v) => v === 0));
    e.timeline.setLayerVisible(true);
    assert.deepEqual(pixel(e, 1, 1), [255, 0, 0, 128]);
    // Ordinary brush painting still rejects hidden layers.
    e = make();
    e.timeline.setLayerVisible(false);
    e.history.markSaved();
    e.drawing.settings.setSettings({ tool: "pencil" });
    e.pointerDown({ x: 1, y: 1 });
    e.pointerUp({ x: 1, y: 1 });
    assert.equal(e.getSnapshot().dirty, false);
    assert.ok(e.getSnapshot().document.layer.pixels.data.every((v) => v === 0));
    // Locked layers reject text before creating a floating preview/history entry.
    for (const visible of [true, false]) {
      e = make();
      e.timeline.setLayerVisible(visible);
      e.timeline.setLayerLocked(true);
      e.history.markSaved();
      const before = e.getSnapshot();
      assert.equal(e.drawing.text.beginTextPaste("X", 1), false);
      assert.equal(e.getSnapshot(), before);
      assert.equal(e.getSnapshot().floatingPaste, null);
      assert.equal(e.getSnapshot().dirty, false);
    }
    console.log(
      "Hidden-layer text paste: cel mutation/visibility, undo/redo, reveal, brush rejection and locked atomic rejection pass.",
    );
  }, 60_000);
});

describe("editor-effects [feature-7-12]", () => {
  it("editor-effects behavior", async () => {
    Error.stackTraceLimit = 0;
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/editor/RasterEditor.ts"],
      bundle: true,
      format: "esm",
      write: false,
    });
    const { RasterEditor } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const image = {
      width: 4,
      height: 4,
      data: Uint8ClampedArray.from(Array.from({ length: 16 }, () => [255, 20, 50, 255]).flat()),
    };
    const e = new RasterEditor(image);
    assert.equal(e.imageEditing.beginEffect(), true);
    const original = e.canvas.composite().data.slice(),
      revision = e.getSnapshot().persistenceRevision;
    e.imageEditing.previewEffect({ kind: "invert" });
    assert.equal(e.getSnapshot().dirty, false);
    assert.equal(e.getSnapshot().canUndo, false);
    assert.equal(e.getSnapshot().persistenceRevision, revision);
    assert.deepEqual(e.canvas.composite().data, original);
    assert.deepEqual(Array.from(e.canvas.previewComposite().data.slice(0, 4)), [0, 235, 205, 255]);
    e.imageEditing.previewEffect({ kind: "brightness-contrast", brightness: -50, contrast: 0 });
    assert.equal(e.getSnapshot().canUndo, false);
    e.imageEditing.previewEffect(null);
    assert.deepEqual(e.canvas.previewComposite().data, original);
    assert.equal(e.getSnapshot().dirty, false);
    e.imageEditing.applyEffect({ kind: "invert" });
    const applied = e.canvas.composite().data.slice();
    assert.equal(e.getSnapshot().dirty, true);
    e.imageEditing.previewEffect({ kind: "invert" });
    assert.deepEqual(e.canvas.previewComposite().data, original);
    e.imageEditing.previewEffect(null);
    assert.deepEqual(
      e.canvas.composite().data,
      applied,
      "Cancel after Apply keeps committed effect",
    );
    e.history.undo();
    assert.deepEqual(e.canvas.composite().data, original);
    assert.equal(e.getSnapshot().dirty, false);
    assert.equal(e.getSnapshot().canUndo, false, "A filter application is one history entry");
    e.history.redo();
    assert.deepEqual(e.canvas.composite().data, applied);
    e.history.markSaved();
    e.imageEditing.applyEffect({ kind: "brightness-contrast", brightness: 0, contrast: 0 });
    assert.equal(e.getSnapshot().dirty, false, "No-op Apply keeps saved content clean");
    e.drawing.settings.setSettings({ tool: "marquee" });
    e.pointerDown({ x: 1, y: 1 });
    e.pointerUp({ x: 2, y: 2 });
    const mask = e.getSnapshot().document.selection;
    e.imageEditing.previewEffect({ kind: "invert" });
    assert.equal(e.getSnapshot().document.selection, mask);
    assert.deepEqual(Array.from(e.canvas.previewComposite().data.slice(0, 4)), [0, 235, 205, 255]);
    e.imageEditing.applyEffect({ kind: "invert" });
    assert.equal(e.getSnapshot().document.selection, mask);
    e.document.loadImage(image);
    assert.equal(e.getSnapshot().canUndo, false);
    e.imageEditing.previewEffect({ kind: "invert" });
    e.document.loadImage(image);
    assert.deepEqual(
      e.canvas.previewComposite().data,
      image.data,
      "Replacing document clears old effect draft",
    );
    e.document.close();
    assert.equal(e.imageEditing.beginEffect(), false);
    e.imageEditing.previewEffect({ kind: "invert" });
    assert.equal(e.getSnapshot().document, null);
    console.log(
      "Editor effects: draft/cancel identity, immutable preview, Apply-then-Cancel, single undo/redo, no-op, selection, document switch and Home passed",
    );
  }, 60_000);
});

describe("editor-selection-edges [feature-1-6]", () => {
  it("editor-selection-edges behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/editor/RasterEditor.ts"],
      bundle: true,
      format: "esm",
      write: false,
    });
    const { RasterEditor } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const image = {
      width: 4,
      height: 4,
      data: Uint8ClampedArray.from(Array.from({ length: 16 }, () => [255, 0, 0, 255]).flat()),
    };
    const e = new RasterEditor(image);
    const move = (dx, dy) => {
      e.drawing.settings.setSettings({ tool: "move" });
      e.pointerDown({ x: 0, y: 0 });
      e.pointerUp({ x: dx, y: dy });
    };
    move(-2, -1);
    e.selection.selectColorRange([255, 0, 0, 255]);
    let m = e.getSnapshot().document.selection;
    assert.deepEqual([m.x, m.y, m.width, m.height], [-2, -1, 4, 4]);
    e.selection.deselect();
    e.selection.reselect();
    m = e.getSnapshot().document.selection;
    assert.deepEqual(
      [m.x, m.y, m.width, m.height],
      [-2, -1, 4, 4],
      "Reselect retains offcanvas mask",
    );
    e.drawing.settings.setSettings({ tool: "marquee", selectionMode: "add" });
    e.pointerDown({ x: 3, y: 3 });
    e.pointerUp();
    m = e.getSnapshot().document.selection;
    assert.deepEqual(
      [m.x, m.y, m.width, m.height],
      [-2, -1, 6, 5],
      "Add preserves old outside pixels",
    );
    e.history.undo();
    assert.equal(e.getSnapshot().document.selection.width, 4);
    e.document.loadImage(image);
    move(32760, 0);
    e.selection.selectColorRange([255, 0, 0, 255]);
    const base = e.getSnapshot().document.selection;
    move(-65528, 0);
    const before = e.getSnapshot();
    e.selection.previewColorRange({ color: [255, 0, 0, 255], tolerance: 0, mode: "add" });
    assert.equal(e.getSnapshot().document.selection, base);
    assert.match(e.getSnapshot().status, /selection width/);
    e.selection.selectColorRange([255, 0, 0, 255], 0, "add");
    assert.equal(e.getSnapshot().document.selection, base);
    assert.equal(e.getSnapshot().canUndo, before.canUndo);
    assert.equal(e.getSnapshot().persistenceRevision, before.persistenceRevision);
    e.history.undo();
    assert.equal(
      e.getSnapshot().document.layer.x,
      32760,
      "Failed allocation did not leave an open transaction or add undo",
    );
    console.log(
      "Editor offcanvas Color Range/Reselect/Add masks and transactional allocation-limit recovery passed",
    );
  }, 60_000);
});

describe("editor-pixel-perfect", () => {
  it("editor-pixel-perfect behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { RasterEditor, supportsPixelPerfect } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const blank = () => ({ width: 8, height: 8, data: new Uint8ClampedArray(256) });
    const pixel = (e, x, y) =>
      Array.from(e.canvas.composite().data.slice((y * 8 + x) * 4, (y * 8 + x) * 4 + 4));
    const make = (pixels = blank()) => {
      const e = new RasterEditor(pixels);
      e.drawing.settings.setSettings({ pixelPerfect: true, foreground: [255, 0, 0, 255] });
      return e;
    };
    const corner = (e) => {
      e.pointerDown({ x: 1, y: 1 });
      e.pointerMove({ x: 2, y: 1 });
      e.pointerMove({ x: 2, y: 2 });
    };
    let e = make();
    assert.ok(supportsPixelPerfect(e.getSnapshot().settings));
    corner(e);
    assert.deepEqual(pixel(e, 2, 1), [0, 0, 0, 0], "L corner is removed immediately");
    assert.deepEqual(pixel(e, 1, 1), [255, 0, 0, 255]);
    assert.deepEqual(pixel(e, 2, 2), [255, 0, 0, 255]);
    e.pointerUp();
    e.history.undo();
    assert.ok(
      e.canvas.composite().data.every((v) => v === 0),
      "Complete gesture including restore undone",
    );
    assert.equal(e.getSnapshot().canUndo, false);
    e.history.redo();
    assert.deepEqual(pixel(e, 2, 1), [0, 0, 0, 0]);
    assert.deepEqual(pixel(e, 2, 2), [255, 0, 0, 255]);
    e = make();
    e.drawing.settings.setSettings({ pixelPerfect: false });
    corner(e);
    e.pointerUp();
    assert.deepEqual(pixel(e, 2, 1), [255, 0, 0, 255], "Disabled policy preserves ordinary L");
    const colored = blank();
    colored.data.set([23, 44, 211, 129], (1 * 8 + 2) * 4);
    e = make(colored);
    e.drawing.settings.setSettings({ opacity: 128 });
    corner(e);
    assert.deepEqual(
      pixel(e, 2, 1),
      [23, 44, 211, 129],
      "Restore exact underlying RGBA, not erasure",
    );
    assert.equal(pixel(e, 2, 2)[3], 128);
    e.pointerMove({ x: 2, y: 1 });
    assert.notDeepEqual(
      pixel(e, 2, 1),
      [23, 44, 211, 129],
      "Retrace removed pixel repaints after coverage restore",
    );
    e.cancelGesture();
    assert.deepEqual(
      e.canvas.composite().data,
      colored.data,
      "Cancel after restore and retrace returns exact original",
    );
    e = make();
    // A one-pixel mask uses Add: Aseprite Replace single-click deselects.
    e.drawing.settings.setSettings({ tool: "marquee", selectionMode: "add" });
    e.pointerDown({ x: 2, y: 2 });
    e.pointerUp();
    e.drawing.settings.setSettings({ tool: "pencil" });
    corner(e);
    e.pointerUp();
    assert.deepEqual(pixel(e, 1, 1), [0, 0, 0, 0]);
    assert.deepEqual(pixel(e, 2, 1), [0, 0, 0, 0]);
    assert.deepEqual(pixel(e, 2, 2), [255, 0, 0, 255], "Paint and restore both respect selection");
    e.history.undo();
    assert.ok(e.canvas.composite().data.every((v) => v === 0));
    assert.ok(e.getSnapshot().document.selection);
    e = make();
    e.drawing.settings.setSettings({ tool: "move" });
    e.pointerDown({ x: 0, y: 0 });
    e.pointerUp({ x: 3, y: 0 });
    e.drawing.settings.setSettings({ tool: "pencil" });
    corner(e);
    e.pointerUp();
    assert.deepEqual(pixel(e, 2, 1), [0, 0, 0, 0], "Path uses expanded image-local coordinates");
    assert.deepEqual(pixel(e, 2, 2), [255, 0, 0, 255]);
    e.history.undo();
    assert.equal(e.getSnapshot().document.layer.x, 3);
    e = make();
    e.drawing.settings.setSettings({ tool: "line" });
    assert.equal(supportsPixelPerfect(e.getSnapshot().settings), false);
    e = make();
    e.drawing.settings.setSettings({ brush: { shape: "line", size: 1, angle: 0 } });
    assert.equal(supportsPixelPerfect(e.getSnapshot().settings), true);
    corner(e);
    e.pointerUp();
    assert.deepEqual(pixel(e, 2, 1), [0, 0, 0, 0]);
    e = make();
    e.drawing.settings.setSettings({ brush: { shape: "square", size: 1, angle: 0 } });
    assert.equal(supportsPixelPerfect(e.getSnapshot().settings), true);
    corner(e);
    e.pointerUp();
    assert.deepEqual(pixel(e, 2, 1), [0, 0, 0, 0]);

    // When a corrected endpoint was painted earlier in the same gesture, restoring
    // its coverage must keep that earlier stamp protected from alpha accumulation.
    e = make();
    e.drawing.settings.setSettings({ opacity: 128 });
    const crossing = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
      { x: 4, y: 2 },
      { x: 4, y: 3 },
      { x: 3, y: 3 },
      { x: 2, y: 3 },
      { x: 2, y: 2 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ];
    e.pointerDown(crossing[0]);
    for (const p of crossing.slice(1)) e.pointerMove(p);
    assert.deepEqual(pixel(e, 2, 1), [255, 0, 0, 128]);
    e.pointerUp();
    e.history.undo();
    assert.ok(e.canvas.composite().data.every((v) => v === 0));
    console.log(
      "Pixel-perfect model checks passed: live L correction, ordinary fallback, exact underlying alpha restoration, coverage retrace, cancel, undo/redo, selection, moved cel, and supported-mode predicate.",
    );

    const opaque = blank();
    for (let i = 0; i < opaque.data.length; i += 4) opaque.data.set([21, 45, 90, 173], i);
    e = make(opaque);
    e.drawing.settings.setSettings({
      tool: "eraser",
      opacity: 128,
      pixelPerfect: true,
      brush: { shape: "circle", size: 1, angle: 0 },
    });
    corner(e);
    assert.deepEqual(
      pixel(e, 2, 1),
      [21, 45, 90, 173],
      "Pixel-perfect eraser restores original alpha/RGB at corrected corner",
    );
    assert.ok(pixel(e, 2, 2)[3] < 173);
    e.pointerUp();
    e.history.undo();
    assert.deepEqual(e.canvas.composite().data, opaque.data);
    e.history.redo();
    assert.deepEqual(pixel(e, 2, 1), [21, 45, 90, 173]);
    // Aseprite fillStroke consumes the filtered m_pts path; selection ink must not
    // replay paint save/restore into the artwork. One-pixel contour uses same fill.
    e = make();
    e.drawing.settings.setSettings({ tool: "lasso", pixelPerfect: true });
    corner(e);
    assert.deepEqual(e.getSnapshot().preview.points, [
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
    e.pointerUp();
    let mask = e.getSnapshot().document.selection;
    assert.equal(
      mask.data[(1 - mask.y) * mask.width + 2 - mask.x],
      0,
      "Lasso excludes corrected corner from filled mask",
    );
    assert.equal(mask.data[(2 - mask.y) * mask.width + 2 - mask.x], 1);
    assert.ok(e.canvas.composite().data.every((v) => !v));
    e.history.undo();
    assert.equal(e.getSnapshot().document.selection, null);
    e.history.redo();
    assert.ok(e.getSnapshot().document.selection);
    e = make();
    e.drawing.settings.setSettings({ tool: "contour", pixelPerfect: true });
    corner(e);
    e.pointerUp();
    assert.deepEqual(pixel(e, 2, 1), [0, 0, 0, 0], "Contour fills filtered Aseprite path");
    assert.deepEqual(pixel(e, 2, 2), [255, 0, 0, 255]);
    e.history.undo();
    assert.ok(e.canvas.composite().data.every((v) => !v));
  }, 60_000);
});

describe("editor-selection-shapes [feature-1-6]", () => {
  it("editor-selection-shapes behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/editor/RasterEditor.ts"],
      bundle: true,
      format: "esm",
      write: false,
    });
    const { RasterEditor } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const image = () => ({ width: 12, height: 12, data: new Uint8ClampedArray(12 * 12 * 4) });
    const make = () => new RasterEditor(image());
    const count = (m) => m?.data.reduce((a, b) => a + !!b, 0) ?? 0;
    const rect = (e, a, b, input = {}) => {
      e.drawing.settings.setSettings({ tool: "marquee" });
      e.pointerDown({ ...a, ...input });
      e.pointerUp({ ...b, ...input });
    };
    const e = make();
    rect(e, { x: 1, y: 1 }, { x: 3, y: 3 });
    rect(e, { x: 3, y: 1 }, { x: 5, y: 3 }, { shift: true });
    assert.equal(
      count(e.getSnapshot().document.selection),
      15,
      "Shift adds instead of moving existing selection",
    );
    assert.equal(e.getSnapshot().floatingPaste, null);
    assert.equal(e.getSnapshot().dirty, false);
    rect(e, { x: 3, y: 1 }, { x: 5, y: 3 }, { alt: true, shift: true });
    assert.equal(count(e.getSnapshot().document.selection), 6);
    e.history.undo();
    assert.equal(count(e.getSnapshot().document.selection), 15);
    rect(e, { x: 3, y: 1 }, { x: 5, y: 3 }, { ctrl: true, shift: true });
    assert.equal(count(e.getSnapshot().document.selection), 9);
    e.selection.deselect();
    e.selection.reselect();
    assert.equal(count(e.getSnapshot().document.selection), 9);
    e.selection.modify("contract", 1, "square");
    assert.equal(count(e.getSnapshot().document.selection), 1);
    e.history.undo();
    assert.equal(count(e.getSnapshot().document.selection), 9);
    e.selection.deselect();
    e.drawing.settings.setSettings({ tool: "elliptical_marquee" });
    e.pointerDown({ x: 1, y: 1 });
    e.pointerMove({ x: 3, y: 3 });
    assert.equal(count(e.selection.preview()), 5);
    assert.equal(e.getSnapshot().document.selection, null);
    e.pointerUp();
    assert.equal(count(e.getSnapshot().document.selection), 5);
    e.selection.previewColorRange({ color: [0, 0, 0, 0], tolerance: 0, mode: "replace" });
    assert.equal(count(e.getSnapshot().document.selection), 144);
    e.selection.previewColorRange(null);
    assert.equal(count(e.getSnapshot().document.selection), 5);
    assert.equal(e.getSnapshot().dirty, false);
    e.selection.selectColorRange([0, 0, 0, 0], 0);
    assert.equal(count(e.getSnapshot().document.selection), 144);
    e.history.undo();
    assert.equal(count(e.getSnapshot().document.selection), 5);
    e.selection.deselect();
    e.drawing.settings.setSettings({ tool: "magic_wand" });
    e.pointerDown({ x: 0, y: 0 });
    e.pointerUp();
    assert.equal(count(e.getSnapshot().document.selection), 144);
    assert.equal(e.getSnapshot().dirty, false);
    e.document.loadImage(image());
    e.selection.reselect();
    assert.equal(e.getSnapshot().document.selection, null, "Reselect resets document identity");
    const buttons = make();
    buttons.selection.selectAll();
    buttons.drawing.settings.setSettings({ tool: "marquee", selectionMode: "add" });
    buttons.pointerDown({ x: 1, y: 1, button: 2, shift: true, ctrl: true });
    buttons.pointerUp({ x: 3, y: 3, button: 2 });
    assert.equal(
      count(buttons.getSnapshot().document.selection),
      135,
      "Aseprite secondary selection button subtracts regardless other modes",
    );
    buttons.history.undo();
    assert.equal(count(buttons.getSnapshot().document.selection), 144);
    const frozen = make();
    frozen.selection.selectAll();
    frozen.drawing.settings.setSettings({ tool: "marquee" });
    frozen.pointerDown({ x: 1, y: 1, shift: true, ctrl: true });
    frozen.pointerUp({ x: 3, y: 3 });
    assert.equal(
      count(frozen.getSnapshot().document.selection),
      9,
      "Selection mode freezes at gesture start before shape modifier phase",
    );
    const polygon = make();
    polygon.drawing.settings.setSettings({ tool: "polygonal_lasso" });
    polygon.pointerDown({ x: 1, y: 1 });
    polygon.pointerUp({ x: 5, y: 1 });
    assert.ok(polygon.getSnapshot().preview);
    polygon.pointerDown({ x: 5, y: 1 });
    polygon.pointerUp({ x: 5, y: 5 });
    polygon.pointerDown({ x: 5, y: 5 });
    polygon.pointerUp();
    assert.equal(polygon.getSnapshot().preview, null);
    assert.ok(count(polygon.getSnapshot().document.selection) > 5);
    assert.equal(polygon.getSnapshot().dirty, false);
    polygon.history.undo();
    assert.equal(polygon.getSnapshot().document.selection, null);
    for (const tool of [
      "filled_rectangle",
      "ellipse",
      "filled_ellipse",
      "gradient",
      "line",
      "rectangle",
      "contour",
    ]) {
      const ed = make();
      ed.drawing.settings.setSettings({ tool, foreground: [255, 0, 0, 255] });
      ed.pointerDown({ x: 1, y: 1 });
      ed.pointerMove({ x: 5, y: 5 });
      const before = ed.canvas.composite().data.slice();
      assert.ok(
        ed.canvas.previewComposite().data.some((v) => v),
        "Raster preview exists",
      );
      assert.deepEqual(ed.canvas.composite().data, before, "Preview is immutable");
      ed.pointerUp();
      assert.ok(
        ed.canvas.composite().data.some((v) => v),
        `${tool} commits pixels`,
      );
      assert.equal(ed.getSnapshot().dirty, true);
      ed.history.undo();
      assert.deepEqual(ed.canvas.composite().data, image().data, `${tool} has one undo`);
    }
    for (const tool of ["curve", "polygon"]) {
      const ed = make();
      ed.drawing.settings.setSettings({ tool, foreground: [255, 0, 0, 255] });
      ed.pointerDown({ x: 1, y: 1 });
      ed.pointerUp({ x: 8, y: 1 });
      assert.ok(ed.getSnapshot().preview);
      assert.equal(ed.getSnapshot().dirty, false);
      ed.pointerMove({ x: 5, y: 5 });
      ed.pointerDown({ x: 5, y: 5 });
      ed.pointerUp();
      if (tool === "curve") {
        assert.ok(ed.getSnapshot().preview);
        ed.pointerMove({ x: 7, y: 7 });
        ed.pointerDown({ x: 7, y: 7 });
        ed.pointerUp();
      }
      assert.equal(ed.getSnapshot().preview, null);
      assert.equal(ed.getSnapshot().dirty, true);
      ed.history.undo();
      assert.deepEqual(ed.canvas.composite().data, image().data);
    }
    const cancel = make();
    cancel.drawing.settings.setSettings({ tool: "curve" });
    cancel.pointerDown({ x: 1, y: 1 });
    cancel.pointerUp({ x: 8, y: 1 });
    cancel.drawing.settings.setSettings({ tool: "pencil" });
    assert.equal(cancel.getSnapshot().preview, null);
    assert.equal(cancel.getSnapshot().canUndo, false);
    assert.equal(cancel.getSnapshot().dirty, false);
    console.log(
      "Editor selection/shape integration passed: modifiers, preview, history, reselect, masks, wand, all shapes, Aseprite multi-stage controllers, cancel",
    );
  }, 60_000);
});

describe("editor-model", () => {
  it("editor-model behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { RasterEditor, screenToDocument, documentToScreen, resolveShortcut, stepZoom } =
      await import(
        `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
      );
    const blank = (w = 8, h = 8) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    });
    const red = [255, 0, 0, 255];
    const blue = [0, 0, 255, 255];
    const pixel = (e, x, y) => {
      const p = e.canvas.composite();
      return Array.from(p.data.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 4));
    };
    const stroke = (e, a, b = a) => {
      e.pointerDown(a);
      e.pointerMove(b);
      e.pointerUp();
    };
    const e = new RasterEditor(blank());
    e.drawing.settings.setSettings({ foreground: red });
    const s = e.getSnapshot();
    assert.equal(s, e.getSnapshot(), "Snapshot identity stable between changes");
    let notified = 0;
    const stop = e.subscribe(() => notified++);
    stroke(e, { x: 1, y: 1 }, { x: 6, y: 1 });
    assert.deepEqual(pixel(e, 4, 1), red);
    assert.equal(e.getSnapshot().dirty, true);
    e.history.undo();
    assert.deepEqual(pixel(e, 4, 1), [0, 0, 0, 0]);
    assert.equal(e.getSnapshot().canUndo, false, "Whole stroke is one transaction");
    assert.equal(e.getSnapshot().dirty, false);
    e.history.redo();
    assert.deepEqual(pixel(e, 4, 1), red);
    e.history.markSaved();
    assert.equal(e.getSnapshot().dirty, false);
    e.pointerDown({ x: 2, y: 3 });
    e.pointerMove({ x: 5, y: 3 });
    e.cancelGesture();
    assert.deepEqual(pixel(e, 3, 3), [0, 0, 0, 0]);
    assert.equal(e.getSnapshot().dirty, false);
    const priorCelX = e.getSnapshot().document.layer.x;
    e.drawing.settings.setSettings({ tool: "move" });
    stroke(e, { x: 0, y: 0 }, { x: 7, y: 0 });
    assert.deepEqual(pixel(e, 1, 1), [0, 0, 0, 0]);
    assert.equal(e.getSnapshot().document.layer.x, priorCelX + 7);
    stroke(e, { x: 7, y: 0 }, { x: 0, y: 0 });
    assert.deepEqual(pixel(e, 1, 1), red, "Moving out of canvas retains cel pixels");
    e.history.undo();
    e.history.undo();
    assert.deepEqual(pixel(e, 1, 1), red);
    e.drawing.settings.setSettings({ tool: "move" });
    stroke(e, { x: 0, y: 0 }, { x: 2, y: 0 });
    e.drawing.settings.setSettings({ tool: "pencil", foreground: blue });
    stroke(e, { x: 0, y: 0 });
    assert.deepEqual(pixel(e, 0, 0), blue, "Paint expands moved cel to reach document");
    e.history.undo();
    assert.equal(e.getSnapshot().document.layer.x, priorCelX + 2);
    assert.deepEqual(pixel(e, 0, 0), [0, 0, 0, 0]);
    e.history.redo();
    assert.deepEqual(pixel(e, 0, 0), blue);
    e.document.loadImage(blank());
    e.drawing.settings.setSettings({ tool: "marquee" });
    stroke(e, { x: 2, y: 2 }, { x: 3, y: 3 });
    e.drawing.settings.setSettings({ tool: "bucket", foreground: red });
    stroke(e, { x: 2, y: 2 });
    assert.deepEqual(pixel(e, 2, 2), red);
    assert.deepEqual(pixel(e, 1, 2), [0, 0, 0, 0], "Selection clips flood fill");
    e.selection.deselect();
    assert.equal(e.getSnapshot().document.selection, null);
    e.history.undo();
    assert.ok(e.getSnapshot().document.selection);
    e.timeline.setLayerLocked(true);
    const before = new Uint8ClampedArray(e.canvas.composite().data);
    e.drawing.settings.setSettings({ tool: "pencil" });
    stroke(e, { x: 2, y: 2 }, { x: 3, y: 3 });
    assert.deepEqual(e.canvas.composite().data, before, "Locked layer prevents edits");
    e.timeline.setLayerLocked(false);
    e.timeline.setLayerVisible(false);
    assert.ok(e.canvas.composite().data.every((v) => v === 0));
    e.timeline.setLayerVisible(true);
    assert.deepEqual(pixel(e, 2, 2), red);
    e.drawing.settings.setSettings({ tool: "eyedropper" });
    stroke(e, { x: 2, y: 2, button: 2 });
    assert.deepEqual(e.getSnapshot().settings.background, red);
    e.document.loadImage(blank());
    e.drawing.settings.setSettings({ tool: "line", foreground: red });
    e.pointerDown({ x: 0, y: 0 });
    e.pointerMove({ x: 7, y: 7 });
    assert.deepEqual(pixel(e, 3, 3), [0, 0, 0, 0], "Line stays preview until release");
    e.pointerUp();
    assert.deepEqual(pixel(e, 3, 3), red);
    e.history.undo();
    assert.ok(e.canvas.composite().data.every((v) => v === 0));
    e.drawing.settings.setSettings({ tool: "pencil" });
    stroke(e, { x: 0, y: 7 });
    assert.equal(e.getSnapshot().canRedo, false, "New branch discards redo");
    const font = {
      height: 1,
      lineHeight: 2,
      glyphs: {
        X: { width: 2, height: 1, advance: 3, alpha: new Uint8Array([255, 255]) },
      },
    };
    e.drawing.settings.setSettings({ tool: "text", font, text: "X", textScale: 1 });
    stroke(e, { x: 2, y: 2 });
    assert.equal(e.getSnapshot().inlineText.text, "", "Text click creates an empty editable draft");
    assert.deepEqual(pixel(e, 3, 2), [0, 0, 0, 0], "Typing preview does not paint document yet");
    e.drawing.text.updateInlineText({ text: "X", selectionStart: 1, selectionEnd: 1 });
    assert.equal(e.getSnapshot().inlineText.text, "X");
    assert.equal(e.drawing.text.commitInlineText(), true);
    assert.deepEqual(pixel(e, 3, 2), red);
    e.history.undo();
    assert.deepEqual(pixel(e, 3, 2), [0, 0, 0, 0]);
    e.document.loadImage(blank(), "Palette fixture", [blue, red]);
    e.drawing.settings.setSettings({ tool: "pencil", foreground: [0, 255, 0, 255] });
    stroke(e, { x: 0, y: 0 });
    assert.deepEqual(
      e.getSnapshot().palette,
      [blue, red],
      "Aseprite document palette stays fixed while painting",
    );
    for (const zoom of [1 / 64, 1 / 2, 1, 4, 64]) {
      const p = { x: 12.5, y: -3.25 },
        vp = { width: 640, height: 480 },
        doc = { width: 320, height: 240 },
        view = { zoom, pan: { x: -17, y: 45 } };
      assert.deepEqual(screenToDocument(documentToScreen(p, vp, doc, view), vp, doc, view), p);
    }
    assert.deepEqual(resolveShortcut({ key: "z", meta: true, shift: true }), {
      type: "redo",
    });
    assert.equal(resolveShortcut({ key: "b", editingText: true }), null);
    assert.deepEqual(
      resolveShortcut({ key: "b", shift: true }),
      { type: "tool", tool: "spray" },
      "Shift+B selects the supported spray tool",
    );
    assert.deepEqual(resolveShortcut({ key: "q" }), {
      type: "tool",
      tool: "lasso",
    });
    stop();
    const n = notified;
    e.history.markSaved();
    assert.equal(notified, n);
    console.log(
      "Editor model checks passed: transactional undo/redo/cancel, move retention, expansion history, selection, locking, visibility, sampling, text, palette ordering, pure transforms and shortcut isolation.",
    );
    e.document.loadImage(blank());
    e.drawing.settings.setSettings({ tool: "pencil", foreground: red, opacity: 128 });
    e.pointerDown({ x: 1, y: 1 });
    e.pointerMove({ x: 2, y: 1 });
    e.pointerMove({ x: 1, y: 1 });
    e.pointerUp();
    assert.equal(
      pixel(e, 1, 1)[3],
      128,
      "Repeated pointer segments do not accumulate simple-ink opacity",
    );
    // Shared bounded import palette preserves exact RGBA and deterministic numeric
    // tie ordering, frequency ranking and the 256-color cap.
    let seed = 4723;
    for (let trial = 0; trial < 12; trial++) {
      const p = blank(19, 17),
        counts = new Map();
      for (let i = 0; i < p.data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const c = [seed & 255, (seed >>> 8) & 255, (seed >>> 16) & 255, (seed >>> 24) & 255];
        if (i % 28 === 0) c.splice(0, 4, 255, 12, 90, 128);
        p.data.set(c, i);
        {
          const key = c.join(",");
          const found = counts.get(key);
          if (found) found.count++;
          else counts.set(key, { color: c, count: 1 });
        }
      }
      const expected = [...counts.values()]
        .sort(
          (a, b) =>
            b.count - a.count ||
            a.color[0] * 16777216 +
              a.color[1] * 65536 +
              a.color[2] * 256 +
              a.color[3] -
              (b.color[0] * 16777216 + b.color[1] * 65536 + b.color[2] * 256 + b.color[3]),
        )
        .slice(0, 256)
        .map((v) => v.color);
      e.document.loadImage(p);
      assert.deepEqual(e.getSnapshot().palette, expected);
    }

    // Aseprite sequence contains intermediate 5x and 1/48 levels.
    assert.equal(stepZoom(4, 1), 5);
    assert.ok(Math.abs(stepZoom(1 / 64, 1) - 1 / 48) < 1e-15);
    const sampler = new RasterEditor(blank());
    sampler.drawing.settings.setSettings({ tool: "pencil", foreground: red });
    stroke(sampler, { x: 2, y: 2 });
    sampler.drawing.settings.setSettings({ foreground: blue });
    sampler.pointerDown({ x: 2, y: 2, alt: true });
    sampler.pointerUp();
    assert.deepEqual(sampler.getSnapshot().settings.foreground, red);
    assert.equal(sampler.getSnapshot().settings.tool, "pencil");
    assert.deepEqual(pixel(sampler, 2, 2), red);
  }, 60_000);
});

describe("feature-9-editor [feature-7-12]", () => {
  it("feature-9-editor behavior", async () => {
    const { outputFiles } = await build({
      stdin: {
        resolveDir: process.cwd(),
        contents: `export * from './packages/editor-core/src/index.ts';export * from './packages/editor-core/src/canvas/raster/dynamic-paint-stroke.ts';export * from './packages/editor-core/src/canvas/raster/stroke-dynamics.ts';export * from './apps/editor/src/managers/preferences/dynamics-state.ts';export * from './packages/editor-core/src/canvas/raster/index.ts';export * from './packages/editor-core/src/canvas/assistance/symmetry.ts';`,
      },
      bundle: true,
      format: "esm",
      platform: "node",
      write: false,
    });
    const {
      RasterEditor,
      DynamicPaintStroke,
      StrokeDynamics,
      defaultDynamicsSettings,
      paintStroke,
      brushMask,
      symmetryBrushMask,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const ramp = [
        [10, 20, 30, 255],
        [80, 90, 100, 255],
        [220, 230, 240, 255],
      ],
      image = (color = [0, 0, 0, 0], n = 16) => ({
        width: n,
        height: n,
        data: Uint8ClampedArray.from(Array.from({ length: n * n }, () => color).flat()),
      }),
      pixel = (im, x, y) =>
        Array.from(im.data.slice((y * im.width + x) * 4, (y * im.width + x + 1) * 4));
    const e = new RasterEditor(image(ramp[1]));
    e.drawing.settings.setSettings({ tool: "pencil", ink: "shading", shade: ramp, opacity: 0 });
    e.pointerDown({ x: 3, y: 3 });
    e.pointerMove({ x: 5, y: 3 });
    e.pointerUp();
    assert.deepEqual(pixel(e.canvas.composite(), 4, 3), ramp[0]);
    e.history.undo();
    assert.deepEqual(pixel(e.canvas.composite(), 4, 3), ramp[1]);
    e.history.redo();
    assert.deepEqual(pixel(e.canvas.composite(), 4, 3), ramp[0]);
    e.pointerDown({ x: 4, y: 3, button: 2 });
    e.pointerUp();
    assert.deepEqual(pixel(e.canvas.composite(), 4, 3), ramp[1]);
    const settings = {
      ...defaultDynamicsSettings,
      gradient: "pressure",
      minPressureThreshold: 0,
      maxPressureThreshold: 1,
    };
    const gradient = new RasterEditor(image());
    gradient.drawing.settings.setSettings({
      tool: "pencil",
      ink: "alpha-compositing",
      foreground: [255, 0, 0, 255],
      background: [0, 0, 255, 255],
      opacity: 128,
      dynamics: settings,
    });
    gradient.pointerDown({ x: 4, y: 4, pointerType: "pen", pressure: 0 });
    assert.deepEqual(pixel(gradient.canvas.composite(), 4, 4), [0, 0, 255, 128]);
    gradient.pointerMove({ x: 4, y: 4, pointerType: "pen", pressure: 1 });
    assert.deepEqual(
      pixel(gradient.canvas.composite(), 4, 4),
      [170, 0, 85, 192],
      "stationary gradient-only pressure uses repeated overlap event compositing",
    );
    gradient.pointerUp({ x: 4, y: 4, pointerType: "pen", pressure: 0 });
    assert.deepEqual(pixel(gradient.canvas.composite(), 4, 4), [170, 0, 85, 192]);
    gradient.history.undo();
    assert.equal(gradient.getSnapshot().dirty, false);
    const dither = new RasterEditor(image());
    dither.drawing.settings.setSettings({
      tool: "pencil",
      foreground: [255, 0, 0, 255],
      background: [0, 0, 255, 255],
      brush: { shape: "square", size: 4, angle: 0 },
      dynamics: { ...settings, matrixName: "Bayer Matrix 2x2" },
    });
    dither.pointerDown({ x: 6, y: 6, pointerType: "pen", pressure: 0.5 });
    dither.pointerUp();
    const d = dither.canvas.composite();
    let red = 0,
      blue = 0;
    for (let y = 4; y < 8; y++)
      for (let x = 4; x < 8; x++) {
        const p = pixel(d, x, y);
        if (p[0] === 255) red++;
        if (p[2] === 255) blue++;
      }
    assert.equal(red, 8);
    assert.equal(blue, 8);
    const forkImage = image(ramp[1]),
      dynamics = new StrokeDynamics(
        { x: 3, y: 3, pointerType: "pen", pressure: 0.5 },
        { ...settings, gradient: "static", size: "pressure" },
      ),
      primary = new DynamicPaintStroke(),
      mirror = primary.fork(),
      opts = {
        color: [255, 0, 0, 255],
        brush: { shape: "square", size: 3, angle: 0 },
        opacity: 255,
        ink: "shading",
        shade: ramp,
        shadeDirection: "left",
        patternOrigin: { x: 0, y: 0 },
      };
    primary.paint(
      forkImage,
      [{ x: 3, y: 3 }],
      opts,
      dynamics,
      [0, 0, 0, 255],
      "pencil",
      opts.brush,
    );
    mirror.paint(forkImage, [{ x: 3, y: 3 }], opts, dynamics, [0, 0, 0, 255], "pencil", opts.brush);
    assert.deepEqual(
      pixel(forkImage, 3, 3),
      ramp[0],
      "overlapping branches shade original source once",
    );
    const alphaImage = image([20, 20, 20, 80]),
      painter = new DynamicPaintStroke(),
      branch = painter.fork(),
      alpha = { ...opts, ink: "alpha-compositing", opacity: 100 };
    painter.paint(
      alphaImage,
      [{ x: 3, y: 3 }],
      alpha,
      dynamics,
      [0, 0, 0, 255],
      "pencil",
      alpha.brush,
    );
    const first = pixel(alphaImage, 3, 3);
    branch.paint(
      alphaImage,
      [{ x: 3, y: 3 }],
      alpha,
      dynamics,
      [0, 0, 0, 255],
      "pencil",
      alpha.brush,
    );
    assert.deepEqual(
      pixel(alphaImage, 3, 3),
      first,
      "fork source snapshot prevents opacity accumulating across replicas",
    );
    for (let symmetryIndex = 0; symmetryIndex < 8; symmetryIndex++) {
      const im = image(),
        brush = { shape: "line", size: 7, angle: 30 };
      paintStroke(im, [{ x: 8, y: 8 }], { color: [255, 0, 0, 255], brush, symmetryIndex });
      const m = symmetryBrushMask(brushMask(brush), symmetryIndex);
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const mx = x - 8 - m.x,
            my = y - 8 - m.y,
            expected =
              mx >= 0 && my >= 0 && mx < m.width && my < m.height
                ? !!m.data[my * m.width + mx]
                : false;
          assert.equal(pixel(im, x, y)[3] === 255, expected);
        }
    }
    const perfectImage = image([15, 25, 35, 80]),
      perfect = new DynamicPaintStroke(),
      perfectDynamics = new StrokeDynamics(
        { x: 1, y: 1, pointerType: "pen", pressure: 0.5 },
        settings,
      ),
      perfectOptions = {
        color: [255, 0, 0, 255],
        brush: { shape: "square", size: 1, angle: 0 },
        ink: "alpha-compositing",
        opacity: 180,
      };
    perfect.paint(
      perfectImage,
      [{ x: 1, y: 1 }],
      perfectOptions,
      perfectDynamics,
      [0, 0, 255, 255],
      "pencil",
      perfectOptions.brush,
      true,
    );
    perfectDynamics.update({ x: 2, y: 1, pointerType: "pen", pressure: 0.7 });
    perfect.paint(
      perfectImage,
      [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ],
      perfectOptions,
      perfectDynamics,
      [0, 0, 255, 255],
      "pencil",
      perfectOptions.brush,
      true,
    );
    perfectDynamics.update({ x: 2, y: 2, pointerType: "pen", pressure: 1 });
    perfect.paint(
      perfectImage,
      [
        { x: 2, y: 1 },
        { x: 2, y: 2 },
      ],
      perfectOptions,
      perfectDynamics,
      [0, 0, 255, 255],
      "pencil",
      perfectOptions.brush,
      true,
    );
    assert.deepEqual(
      pixel(perfectImage, 2, 1),
      [15, 25, 35, 80],
      "dynamic gradient pixel-perfect restores underlying corner pixels",
    );
    assert.notDeepEqual(pixel(perfectImage, 2, 2), [15, 25, 35, 80]);
    console.log(
      "PASS live editor shading left/right + history, pressure-gradient-only stationary input, Bayer output, shared-source symmetry forks, all 8 oriented brush masks",
    );
  }, 60_000);
});

describe("selection-dirty", () => {
  it("selection-dirty behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { RasterEditor } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const e = new RasterEditor({
      width: 8,
      height: 8,
      data: new Uint8ClampedArray(256),
    });
    const select = () => {
      e.drawing.settings.setSettings({ tool: "marquee" });
      e.pointerDown({ x: 1, y: 1 });
      e.pointerUp({ x: 3, y: 3 });
    };
    const paint = (x = 1, y = 1) => {
      e.drawing.settings.setSettings({ tool: "pencil" });
      e.pointerDown({ x, y });
      e.pointerUp();
    };
    select();
    assert.equal(e.getSnapshot().dirty, false);
    assert.equal(e.getSnapshot().canUndo, true);
    const mask = e.getSnapshot().document.selection;
    e.selection.deselect();
    assert.equal(e.getSnapshot().dirty, false);
    e.history.undo();
    assert.equal(e.getSnapshot().document.selection, mask);
    assert.equal(e.getSnapshot().dirty, false);
    e.history.undo();
    assert.equal(e.getSnapshot().document.selection, null);
    assert.equal(e.getSnapshot().dirty, false);
    e.history.redo();
    e.history.redo();
    assert.equal(e.getSnapshot().dirty, false);
    paint();
    assert.equal(e.getSnapshot().dirty, true);
    e.history.markSaved();
    assert.equal(e.getSnapshot().dirty, false);
    select();
    e.selection.deselect();
    e.history.markSaved();
    e.history.undo();
    e.history.undo();
    assert.equal(
      e.getSnapshot().dirty,
      false,
      "Undoing selection history after save keeps content clean",
    );
    e.history.undo();
    assert.equal(e.getSnapshot().dirty, true, "Undoing saved pixel content changes identity");
    e.history.redo();
    assert.equal(e.getSnapshot().dirty, false, "Redo to saved pixels restores clean identity");
    // A selection-only branch can discard redo entries without fabricating dirty content.
    e.history.undo();
    select();
    assert.equal(
      e.getSnapshot().dirty,
      true,
      "Selection cannot make missing saved pixel state clean",
    );
    assert.equal(e.getSnapshot().canRedo, false);
    e.history.markSaved();
    e.selection.deselect();
    e.history.undo();
    assert.equal(e.getSnapshot().dirty, false);
    e.history.redo();
    assert.equal(e.getSnapshot().dirty, false);
    paint(4, 4);
    assert.equal(e.getSnapshot().dirty, true);
    e.history.undo();
    assert.equal(e.getSnapshot().dirty, false);
    // View flags are outside undo/dirty history; paste changes content.
    e.timeline.setLayerVisible(false);
    assert.equal(e.getSnapshot().dirty, false);
    e.timeline.setLayerVisible(true);
    e.timeline.setLayerLocked(true);
    assert.equal(e.getSnapshot().dirty, false);
    e.timeline.setLayerLocked(false);
    e.drawing.settings.setSettings({
      font: {
        height: 1,
        lineHeight: 1,
        glyphs: {
          X: { width: 1, height: 1, advance: 1, alpha: new Uint8Array([255]) },
        },
      },
    });
    e.drawing.text.beginTextPaste("X", 1, { x: 5, y: 5 });
    e.clipboard.commitFloatingPaste();
    assert.equal(e.getSnapshot().dirty, true);
    e.history.undo();
    assert.equal(e.getSnapshot().dirty, false);
    console.log(
      "Selection dirty-state checks pass: undoable selection/deselect remain clean; pixel/paste changes dirty; layer view flags stay clean; saved identities survive selection history and branching correctly.",
    );
  }, 60_000);
});

describe("selection-revision", () => {
  it("selection-revision behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { RasterEditor } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const e = new RasterEditor({
      width: 8,
      height: 8,
      data: new Uint8ClampedArray(256),
    });
    let revision = e.getSnapshot().pixelRevision,
      composite = e.canvas.composite();
    const same = () => {
      assert.equal(e.getSnapshot().pixelRevision, revision);
      assert.equal(e.canvas.composite(), composite);
    };
    for (const tool of ["marquee", "lasso"]) {
      e.drawing.settings.setSettings({ tool });
      e.pointerDown({ x: 1, y: 1 });
      same();
      e.pointerMove({ x: 3, y: 1 });
      same();
      e.pointerMove({ x: 3, y: 3 });
      same();
      e.pointerUp();
      same();
      e.selection.deselect();
      same();
      e.history.undo();
      same();
      e.history.undo();
      same();
      e.history.redo();
      same();
      e.history.redo();
      same();
      e.pointerDown({ x: 2, y: 2 });
      e.pointerMove({ x: 4, y: 4 });
      e.cancelGesture();
      same();
    }
    // Pixel/layer changes still invalidate; selection-only undo after them preserves
    // the new cache and revision rather than returning a stale initial image.
    e.drawing.settings.setSettings({ tool: "pencil" });
    e.pointerDown({ x: 0, y: 0 });
    e.pointerUp();
    assert.ok(e.getSnapshot().pixelRevision > revision);
    assert.notEqual(e.canvas.composite(), composite);
    revision = e.getSnapshot().pixelRevision;
    composite = e.canvas.composite();
    // Add deliberately creates the one-pixel mask; Replace click clears it.
    e.drawing.settings.setSettings({ tool: "marquee", selectionMode: "add" });
    e.pointerDown({ x: 0, y: 0 });
    e.pointerUp();
    same();
    e.history.undo();
    same();
    e.history.undo();
    assert.ok(e.getSnapshot().pixelRevision > revision);
    assert.notEqual(e.canvas.composite(), composite);
    revision = e.getSnapshot().pixelRevision;
    composite = e.canvas.composite();
    e.history.redo();
    assert.ok(e.getSnapshot().pixelRevision > revision);
    assert.notEqual(e.canvas.composite(), composite);
    revision = e.getSnapshot().pixelRevision;
    composite = e.canvas.composite();
    e.timeline.setLayerVisible(false);
    assert.ok(e.getSnapshot().pixelRevision > revision);
    assert.notEqual(e.canvas.composite(), composite);
    revision = e.getSnapshot().pixelRevision;
    composite = e.canvas.composite();
    e.timeline.setLayerLocked(true);
    assert.equal(e.getSnapshot().pixelRevision, revision);
    assert.equal(e.canvas.composite(), composite);
    console.log(
      "Selection revision/cache checks pass: marquee/lasso/deselect/cancel/undo/redo preserve composite identity; pixel/visibility edits invalidate it; locking preserves rendered pixels.",
    );
  }, 60_000);
});

describe("selection-dismiss", () => {
  it("selection-dismiss behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      format: "esm",
      write: false,
    });
    const { RasterEditor, executeEditorCommand } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const image = () => ({ width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4) });
    const context = { scene: "document", viewport: { width: 500, height: 400 } };
    const seed = (e) => {
      e.drawing.settings.setSettings({ tool: "marquee", selectionMode: "replace" });
      e.pointerDown({ x: 1, y: 1 });
      e.pointerUp({ x: 5, y: 5 });
    };
    for (const tool of ["marquee", "elliptical_marquee", "lasso"])
      for (const mode of ["replace", "intersect"]) {
        const e = new RasterEditor(image());
        seed(e);
        const original = e.getSnapshot().document.selection;
        e.drawing.settings.setSettings({ tool, selectionMode: mode });
        e.pointerDown({ x: 20, y: 20 });
        e.pointerUp({ x: 20, y: 20 });
        assert.equal(e.getSnapshot().document.selection, null, `${tool}/${mode} click clears`);
        assert.equal(e.getSnapshot().dirty, false);
        e.selection.reselect();
        assert.equal(
          e.getSnapshot().document.selection,
          null,
          "Aseprite outside click replaces mask; Reselect remains unavailable",
        );
        e.history.undo();
        assert.deepEqual(e.getSnapshot().document.selection, original);
      }
    for (const mode of ["add", "subtract"]) {
      const e = new RasterEditor(image());
      seed(e);
      e.drawing.settings.setSettings({ selectionMode: mode });
      e.pointerDown({ x: 20, y: 20 });
      e.pointerUp({ x: 20, y: 20 });
      assert.ok(e.getSnapshot().document.selection, `${mode} click keeps mask`);
    }
    for (const [delta, time, wantSelection] of [
      [2, 100, false],
      [4, 100, true],
      [2, 300, true],
      [0, 300, false],
    ]) {
      const e = new RasterEditor(image());
      seed(e);
      e.pointerDown({ x: 20, y: 20, screen: { x: 100, y: 100 }, timeStamp: 0 });
      e.pointerUp({ x: 20 + delta, y: 20, screen: { x: 100 + delta, y: 100 }, timeStamp: time });
      assert.equal(
        !!e.getSnapshot().document.selection,
        wantSelection,
        `pointer click slop ${delta}px/${time}ms`,
      );
    }
    for (const pointerType of ["touch", "pen", "eraser"])
      for (const [distance, wantSelection] of [
        [8, false],
        [12, false],
        [13, true],
      ]) {
        const contact = new RasterEditor(image());
        seed(contact);
        contact.pointerDown({
          x: 20,
          y: 20,
          screen: { x: 100, y: 100 },
          timeStamp: 0,
          pointerType,
        });
        contact.pointerMove({
          x: 20,
          y: 19,
          screen: { x: 100, y: 100 + distance },
          timeStamp: 40,
          pointerType,
        });
        contact.pointerUp({
          x: 20,
          y: 20,
          screen: { x: 100, y: 100 },
          timeStamp: 66,
          pointerType,
        });
        assert.equal(
          !!contact.getSnapshot().document.selection,
          wantSelection,
          `${pointerType} tracks maximum contact drift, including movement before release`,
        );
      }
    const e = new RasterEditor(image());
    seed(e);
    const before = e.getSnapshot().document.selection;
    e.pointerDown({ x: 20, y: 20 });
    e.pointerMove({ x: 25, y: 25 });
    executeEditorCommand(e, { type: "cancel" }, context);
    assert.deepEqual(
      e.getSnapshot().document.selection,
      before,
      "Cancel in-progress mask restores previous selection",
    );
    e.pointerDown({ x: 2, y: 2 });
    e.pointerUp({ x: 3, y: 2 });
    executeEditorCommand(e, { type: "cancel" }, context);
    assert.equal(
      e.getSnapshot().document.selection,
      null,
      "Escape drops transformed pixels and clears mask",
    );
    executeEditorCommand(e, { type: "cancel" }, context);
    assert.equal(e.getSnapshot().document.selection, null);
    console.log(
      "Selection dismissal: replace/intersect, add/subtract, pointer click slop, reselect, history and transient cancellation passed",
    );
    // Verify real content, not only a transparent mask: Escape drops the move.
    const moved = new RasterEditor(image());
    moved.drawing.settings.setSettings({ tool: "pencil", foreground: [255, 0, 0, 255] });
    moved.pointerDown({ x: 2, y: 2 });
    moved.pointerUp();
    seed(moved);
    moved.pointerDown({ x: 2, y: 2 });
    moved.pointerUp({ x: 4, y: 2 });
    executeEditorCommand(moved, { type: "cancel" }, context);
    assert.equal(moved.getSnapshot().document.selection, null);
    assert.equal(moved.getSnapshot().floatingPaste, null);
    assert.equal(
      moved.canvas.composite().data[(2 * 32 + 4) * 4],
      255,
      "Esc commits moved red pixel",
    );
    assert.equal(
      moved.canvas.composite().data[(2 * 32 + 2) * 4 + 3],
      0,
      "Old pixel remains cleared",
    );
    moved.history.undo();
    moved.history.undo();
    assert.equal(
      moved.canvas.composite().data[(2 * 32 + 2) * 4],
      255,
      "Undo after deselection restores original pixel",
    );

    for (const [distance, duration, want] of [
      [0.4, 450, false],
      [7, 450, false],
      [11, 1200, false],
      [13, 450, false],
    ]) {
      const ed = new RasterEditor(image());
      seed(ed);
      ed.pointerDown({
        x: 20,
        y: 20,
        pointerType: "touch",
        screen: { x: 100, y: 100 },
        timeStamp: 0,
      });
      ed.pointerUp({
        x: 20 + distance / 4,
        y: 20,
        pointerType: "touch",
        screen: { x: 100 + distance, y: 100 },
        timeStamp: duration,
      });
      assert.equal(
        !!ed.getSnapshot().document.selection,
        want,
        `Finger ${distance}px/${duration}ms`,
      );
    }
  }, 60_000);
});
