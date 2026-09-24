import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("layer-editor-integration [feature-1-6]", () => {
  it("layer-editor-integration behavior", async () => {
    const bundle = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { RasterEditor } = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
    );
    const e = new RasterEditor({ width: 4, height: 4, data: new Uint8ClampedArray(64) }, "Layers");
    assert.equal(typeof e.timeline.addGroup, "function", "Timeline owns layer creation operations");
    const t = () => e.getSnapshot().document.timeline;
    const paint = () => {
      e.drawing.settings.setSettings({ tool: "pencil", foreground: [255, 0, 0, 255] });
      e.pointerDown({ x: 0, y: 0 });
      e.pointerUp();
    };
    e.timeline.addGroup("Group");
    const gi = t().activeLayer,
      gid = t().layers[gi].id;
    e.timeline.addLayer("Child");
    const ci = t().activeLayer;
    assert.equal(t().layers[ci].parentId, gid);
    paint();
    e.timeline.setLayerProperties({ blendMode: 1, opacity: 128 });
    assert.equal(t().layers[ci].blendMode, 1);
    e.history.undo();
    assert.equal(t().layers[ci].blendMode ?? 0, 0);
    e.history.redo();
    assert.equal(t().layers[ci].blendMode, 1);
    e.timeline.setLayerLocked(true, gi);
    assert.equal(e.getSnapshot().document.layer.locked, true);
    e.timeline.setLayerLocked(false, gi);
    assert.equal(e.getSnapshot().document.layer.locked, false);
    e.timeline.setLayerVisible(false, gi);
    assert.equal(e.getSnapshot().document.layer.locked, true);
    e.timeline.setLayerVisible(true, gi);
    assert.equal(e.getSnapshot().document.layer.locked, false);
    e.timeline.selectLayer(gi);
    e.timeline.duplicateLayer();
    const copy = t().activeLayer;
    assert.equal(t().layers[copy].kind, "group");
    assert.equal(t().layers[copy + 1].parentId, t().layers[copy].id);
    e.timeline.deleteLayer();
    assert.equal(t().layers.length, 3);
    e.history.undo();
    assert.equal(t().layers.length, 5);
    e.history.redo();
    e.timeline.selectLayer(gi);
    e.timeline.setLayerCollapsed(true);
    assert.ok(t().layers[gi].flags & 32);
    e.timeline.setLayerCollapsed(false);
    assert.ok(!(t().layers[gi].flags & 32));
    const snapshot = e.getPersistenceSnapshot();
    const restored = new RasterEditor();
    restored.restorePersistenceSnapshot(snapshot);
    assert.equal(restored.getSnapshot().document.timeline.layers[ci].parentId, gid);
    assert.equal(restored.getSnapshot().document.timeline.layers[ci].blendMode, 1);
    e.timeline.selectLayer(ci);
    e.timeline.addLayer("Top");
    paint();
    e.timeline.mergeDown();
    assert.equal(t().layers.length, 3);
    e.history.undo();
    assert.equal(t().layers.length, 4);
    e.history.redo();
    e.timeline.flattenLayers();
    assert.equal(t().layers.length, 1);
    e.history.undo();
    assert.equal(t().layers.length, 3);
    e.timeline.selectLayer(0);
    e.sprite.convertLayerBackground(true);
    assert.ok(t().layers[0].flags & 8);
    e.sprite.convertLayerBackground(false);
    assert.ok(!(t().layers[0].flags & 8));
    e.sprite.addReferenceLayer({
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([0, 255, 0, 255]),
    });
    assert.ok(t().layers[t().activeLayer].flags & 64);
    assert.equal(e.getSnapshot().document.layer.locked, true);
    const beforeMove = { ...t().frames[t().activeFrame].cels[t().activeLayer].preciseBounds };
    e.drawing.settings.setSettings({ tool: "move", autoSelectLayer: false });
    e.pointerDown({ x: 0, y: 0 });
    e.pointerMove({ x: 2, y: 1 });
    e.pointerUp();
    const moved = t().frames[t().activeFrame].cels[t().activeLayer];
    assert.equal(moved.preciseBounds.x, beforeMove.x + 2);
    assert.equal(moved.preciseBounds.y, beforeMove.y + 1);
    e.history.undo();
    assert.equal(t().frames[t().activeFrame].cels[t().activeLayer].preciseBounds.x, beforeMove.x);
    e.history.redo();
    assert.equal(
      t().frames[t().activeFrame].cels[t().activeLayer].preciseBounds.x,
      beforeMove.x + 2,
    );
    const fractional = new RasterEditor({ width: 5, height: 4, data: new Uint8ClampedArray(80) });
    fractional.sprite.addReferenceLayer({
      width: 2,
      height: 3,
      data: new Uint8ClampedArray(24).fill(255),
    });
    const fc = () => {
      const t = fractional.getSnapshot().document.timeline;
      return t.frames[0].cels[t.activeLayer];
    };
    const fb = { ...fc().preciseBounds };
    assert.ok(!Number.isInteger(fb.x));
    fractional.drawing.settings.setSettings({ tool: "move", autoSelectLayer: false });
    fractional.pointerDown({ x: 1, y: 1 });
    fractional.pointerMove({ x: 2, y: 2 });
    fractional.pointerUp();
    assert.equal(fc().preciseBounds.x, fb.x + 1);
    assert.equal(fc().preciseBounds.y, fb.y + 1);
    fractional.history.undo();
    assert.deepEqual(fc().preciseBounds, fb);
    console.log(
      "Actual RasterEditor: group insertion, blend undo, parent flags, subtree duplicate/delete, collapse, persistence reload, merge/flatten undo, background conversion and reference import pass.",
    );
  }, 60_000);
});

describe("background-layer", () => {
  it("background-layer behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const api = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );

    const pixelData = (width, height, color) => {
      const data = new Uint8Array(width * height * 4);
      for (let offset = 0; offset < data.length; offset += 4) data.set(color, offset);
      return data;
    };
    const cel = (layerIndex, width, height, x, y, pixels) => ({
      layerIndex,
      x,
      y,
      opacity: 255,
      zIndex: 0,
      type: "raw",
      rawType: 0,
      width,
      height,
      pixels,
    });
    const layer = (index, name, flags, background = false) => ({
      index,
      type: "image",
      flags,
      visible: (flags & 1) !== 0,
      editable: (flags & 2) !== 0,
      moveLocked: (flags & 4) !== 0,
      locked: (flags & 2) === 0,
      background,
      collapsed: false,
      reference: false,
      continuous: false,
      name,
      childLevel: 0,
      blendMode: 0,
      opacity: 255,
      defaultWidth: 0,
      defaultHeight: 0,
    });

    const yellow = [250, 217, 55, 255];
    const backgroundPixels = pixelData(4, 2, yellow);
    const foregroundPixels = new Uint8Array([255, 0, 0, 255]);
    const source = {
      width: 4,
      height: 2,
      depth: 32,
      flags: 1,
      frames: Array.from({ length: 4 }, (_, index) => ({
        index,
        duration: 100,
        cels: [cel(0, 4, 2, 0, 0, backgroundPixels), cel(1, 1, 1, 1, 0, foregroundPixels)],
      })),
      layers: [layer(0, "Background", 15, true), layer(1, "Sprite", 3)],
      tags: [
        {
          from: 0,
          to: 3,
          direction: "forward",
          repeat: 3,
          color: [0, 0, 0, 255],
          name: "finite",
        },
      ],
      chunks: [],
      header: {
        fileSize: 0,
        magic: 0xa5e0,
        speed: 100,
        next: 0,
        frit: 0,
        transparentIndex: 0,
        ncolors: 0,
        pixelWidth: 1,
        pixelHeight: 1,
        gridX: 0,
        gridY: 0,
        gridWidth: 16,
        gridHeight: 16,
        ignore: [0, 0, 0],
      },
      format: "aseprite",
    };

    const project = api.projectFromAseprite(source);
    assert.equal(project.timeline.layers[0].flags & api.LAYER_BACKGROUND, api.LAYER_BACKGROUND);
    assert.equal(project.timeline.layers[0].flags & api.LAYER_LOCK_MOVE, api.LAYER_LOCK_MOVE);
    assert.deepEqual(Array.from(project.image.data.slice(0, 4)), yellow);
    assert.deepEqual(Array.from(project.image.data.slice(4, 8)), [255, 0, 0, 255]);

    const editor = new api.RasterEditor();
    editor.document.loadTimeline(
      project.timeline,
      source.width,
      source.height,
      "background.aseprite",
    );
    assert.equal(editor.getSnapshot().document.timeline.layers[0].name, "Background");

    // Background layers are fixed at the bottom, but remain pixel-editable.
    editor.timeline.selectLayer(0);
    editor.timeline.moveLayer(1);
    assert.deepEqual(
      editor.getSnapshot().document.timeline.layers.map((item) => item.name),
      ["Background", "Sprite"],
    );
    editor.drawing.settings.setSettings({ tool: "pencil", foreground: [1, 2, 3, 17] });
    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerUp();
    assert.deepEqual(
      Array.from(editor.getSnapshot().document.timeline.frames[0].cels[0].pixels.data.slice(0, 4)),
      [1, 2, 3, 255],
    );

    editor.drawing.settings.setSettings({
      tool: "eraser",
      opacity: 255,
      background: [9, 8, 7, 11],
    });
    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerUp();
    assert.deepEqual(
      Array.from(editor.getSnapshot().document.timeline.frames[0].cels[0].pixels.data.slice(0, 4)),
      [9, 8, 7, 255],
    );

    editor.selection.selectAll();
    editor.drawing.settings.setSettings({ background: [11, 12, 13, 0] });
    editor.selection.clearSelectionPixels();
    assert.ok(
      editor
        .getSnapshot()
        .document.timeline.frames[0].cels[0].pixels.data.every(
          (value, index) => value === [11, 12, 13, 255][index % 4],
        ),
    );
    assert.equal(
      editor.selection.nudgeSelection(1, 0),
      false,
      "Aseprite background cels cannot be moved",
    );
    editor.timeline.setPlaying(true);
    editor.timeline.advancePlayback(100000);
    assert.equal(
      editor.getSnapshot().playing,
      true,
      "Play Subtags does not loop a finite active tag in isolation",
    );
    assert.ok(editor.getSnapshot().document.timeline.activeFrame >= 0);
    assert.ok(editor.getSnapshot().document.timeline.activeFrame < 4);

    const roundTrip = api.asepriteFromProject(
      api.projectFromDocument(editor.getSnapshot().document),
    );
    assert.equal(roundTrip.layers[0].background, true);
    assert.equal(roundTrip.layers[0].flags & api.LAYER_BACKGROUND, api.LAYER_BACKGROUND);
    assert.equal(roundTrip.layers[0].flags & api.LAYER_LOCK_MOVE, api.LAYER_LOCK_MOVE);
    const reopened = api.decodeAsepriteSync(api.encodeAsepriteSync(roundTrip));
    assert.equal(reopened.layers[0].background, true);
    assert.equal(reopened.layers[0].flags & api.LAYER_BACKGROUND, api.LAYER_BACKGROUND);
    assert.equal(reopened.tags[0].repeat, 3);

    assert.throws(
      () =>
        api.projectFromAseprite({
          ...source,
          layers: [source.layers[1], source.layers[0]],
        }),
      /background layer must be the bottom/i,
    );

    console.log(
      "Background/tag support passes: Aseprite flags, opaque paint/erase/clear, fixed stack order, finite-repeat playback, movement guard, and ASE round-trip.",
    );
  }, 60_000);
});

describe("layer-conversion-guards [feature-1-6]", () => {
  it("layer-conversion-guards behavior", async () => {
    const b = await build({
      stdin: {
        contents:
          'export * from "./packages/editor-core/src/timeline/layer-operations.ts";export * from "./packages/editor-core/src/editor/RasterEditor.ts";',
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const m = await import(
      "data:text/javascript;base64," + Buffer.from(b.outputFiles[0].contents).toString("base64")
    );
    const l = (id, extra = {}) => ({
      id,
      name: id,
      visible: true,
      locked: false,
      opacity: 255,
      flags: 3,
      ...extra,
    });
    const t = (layers, activeLayer = 0) => ({
      layers,
      activeLayer,
      activeFrame: 0,
      frames: [{ duration: 100, cels: layers.map(() => null) }],
    });
    const cases = [
      ["no project", undefined, false, false],
      ["empty project", t([]), false, false],
      ["plain image", t([l("a")]), true, false],
      ["background", t([l("a", { flags: 15 })]), false, true],
      ["hidden image", t([l("a", { visible: false })]), false, false],
      ["locked image", t([l("a", { locked: true })]), false, false],
      ["reference", t([l("a", { flags: 67 })]), false, false],
      ["group", t([l("g", { kind: "group" })]), false, false],
      ["tilemap", t([l("tile", { source: { type: "tilemap" } })]), false, false],
      ["another background", t([l("bg", { flags: 15 }), l("a")], 1), false, false],
      [
        "hidden ancestor",
        t([l("g", { kind: "group", visible: false }), l("a", { parentId: "g" })], 1),
        false,
        false,
      ],
      [
        "locked ancestor",
        t([l("g", { kind: "group", locked: true }), l("a", { parentId: "g" })], 1),
        false,
        false,
      ],
      [
        "child in normal group",
        t([l("g", { kind: "group" }), l("a", { parentId: "g" })], 1),
        true,
        false,
      ],
      ["hidden background", t([l("bg", { flags: 15, visible: false })]), false, false],
      ["locked background", t([l("bg", { flags: 15, locked: true })]), false, false],
    ];
    for (const [name, timeline, toBackground, toLayer] of cases) {
      assert.equal(m.canConvertBackground(timeline, true), toBackground, name + " to background");
      assert.equal(m.canConvertBackground(timeline, false), toLayer, name + " to layer");
      if (timeline) {
        for (const to of [false, true])
          if (!m.canConvertBackground(timeline, to))
            assert.equal(
              m.convertBackground(timeline, 2, 2, [255, 255, 255, 255], to),
              timeline,
              name + " immutable no-op",
            );
      }
    }
    const e = new m.RasterEditor({ width: 2, height: 2, data: new Uint8ClampedArray(16) });
    const unchanged = (to) => {
      const before = e.getSnapshot(),
        p = e.getPersistenceSnapshot();
      e.sprite.convertLayerBackground(to);
      const after = e.getSnapshot();
      assert.equal(after, before, "disabled core conversion must not even publish");
      assert.deepEqual(
        e.getPersistenceSnapshot(),
        p,
        "disabled conversion must not change recovery",
      );
    };
    unchanged(false);
    e.timeline.setLayerLocked(true);
    unchanged(true);
    e.timeline.setLayerLocked(false);
    e.timeline.setLayerVisible(false);
    unchanged(true);
    e.timeline.setLayerVisible(true);
    e.sprite.convertLayerBackground(true);
    assert.ok(e.getSnapshot().document.timeline.layers[0].flags & 8);
    const conversion = e.getSnapshot();
    unchanged(true);
    e.timeline.setLayerLocked(true);
    unchanged(false);
    e.timeline.setLayerLocked(false);
    e.sprite.convertLayerBackground(false);
    assert.ok(!(e.getSnapshot().document.timeline.layers[0].flags & 8));
    e.history.undo();
    assert.ok(e.getSnapshot().document.timeline.layers[0].flags & 8);
    assert.equal(e.getSnapshot().canRedo, true);
    assert.equal(conversion.canUndo, true);
    e.timeline.addGroup("Group");
    const gi = e.getSnapshot().document.timeline.activeLayer;
    e.timeline.addLayer("Child");
    e.timeline.setLayerVisible(false, gi);
    unchanged(true);
    e.timeline.setLayerVisible(true, gi);
    e.timeline.setLayerLocked(true, gi);
    unchanged(true);
    const menu = readFileSync(
        "apps/editor/src/components/shell/editor-menubar.tsx",
        "utf8",
      ).replace(/\s+/g, " "),
      chrome = readFileSync(
        "apps/editor/src/components/timeline/editor-timeline/index.tsx",
        "utf8",
      ).replace(/\s+/g, " ");
    assert.ok(menu.includes('!canConvertBackground(timeline, node.params?.to === "background")'));
    assert.ok(chrome.includes("disabled: !canConvertBackground(timeline, true)"));
    assert.ok(chrome.includes("!canConvertBackground(timeline, false)"));
    console.log(
      "ConvertLayer Aseprite guards: 15 availability cases, invalid immutable operations, no core publish/history/recovery changes, valid conversion undo/redo, shared main/context capability predicate pass.",
    );
  }, 60_000);
});

describe("selection-layer-commands", () => {
  it("selection-layer-commands behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const api = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const { RasterEditor } = api;
    const image = (width, height, fn) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) data.set(fn(x, y), (y * width + x) * 4);
      return { width, height, data };
    };
    const pixels = image(6, 5, (x, y) => [20 + x, 40 + y, 60 + x + y, 255]);
    const select = (editor) => {
      editor.drawing.settings.setSettings({ tool: "marquee", selectionMode: "replace" });
      editor.pointerDown({ x: 1, y: 1 });
      editor.pointerUp({ x: 3, y: 3 });
    };
    const colorAt = (buffer, x, y) =>
      Array.from(buffer.data.slice((y * buffer.width + x) * 4, (y * buffer.width + x) * 4 + 4));

    const selectionEditor = new RasterEditor();
    selectionEditor.document.loadImage(pixels, "sprite.aseprite", [
      [0, 0, 0, 0],
      [255, 255, 255, 255],
    ]);
    select(selectionEditor);
    const selection = selectionEditor.getSnapshot().document.selection;
    assert.deepEqual(
      { x: selection.x, y: selection.y, width: selection.width, height: selection.height },
      { x: 1, y: 1, width: 3, height: 3 },
    );
    const extracted = selectionEditor.clipboard.createSpriteFromSelection();
    assert.equal(
      extracted.name,
      "sprite-1x1-3x3",
      "New Sprite From Selection uses Aseprite base-title/bounds naming",
    );
    assert.equal(extracted.image.pixels.width, 3);
    assert.equal(extracted.image.pixels.height, 3);
    assert.deepEqual(colorAt(extracted.image.pixels, 0, 0), colorAt(pixels, 1, 1));
    assert.deepEqual(
      selectionEditor.getSnapshot().document.selection,
      selection,
      "Extracting a sprite leaves the original mask selected",
    );

    const copyEditor = new RasterEditor();
    copyEditor.document.loadImage(pixels, "copy.aseprite");
    select(copyEditor);
    const originalCopy = copyEditor.canvas.exportComposite().data.slice();
    assert.equal(copyEditor.clipboard.newLayerViaSelection(false), true);
    let copyState = copyEditor.getSnapshot().document,
      copyTimeline = copyState.timeline,
      copyCel = copyTimeline.frames[copyTimeline.activeFrame].cels[copyTimeline.activeLayer];
    assert.equal(copyTimeline.layers.length, 2);
    assert.equal(copyCel.x, 1);
    assert.equal(copyCel.y, 1);
    assert.equal(copyCel.pixels.width, 3);
    assert.equal(copyCel.pixels.height, 3);
    assert.deepEqual(
      copyCel.pixels.data.slice(0, 4),
      pixels.data.slice((1 * 6 + 1) * 4, (1 * 6 + 1) * 4 + 4),
    );
    assert.deepEqual(
      copyEditor.canvas.exportComposite().data,
      originalCopy,
      "Copy creates an overlay without changing the visible sprite",
    );
    assert.ok(copyState.selection, "Copy keeps the mask visible");
    copyEditor.history.undo();
    assert.equal(
      copyEditor.getSnapshot().document.timeline.layers.length,
      1,
      "Undo removes the copied layer",
    );
    copyEditor.history.redo();
    assert.equal(
      copyEditor.getSnapshot().document.timeline.layers.length,
      2,
      "Redo restores the copied layer",
    );

    const cutEditor = new RasterEditor();
    cutEditor.document.loadImage(pixels, "cut.aseprite");
    select(cutEditor);
    const originalCut = cutEditor.canvas.exportComposite().data.slice();
    assert.equal(cutEditor.clipboard.newLayerViaSelection(true), true);
    const cutState = cutEditor.getSnapshot().document,
      cutTimeline = cutState.timeline,
      sourceCel = cutTimeline.frames[cutTimeline.activeFrame].cels[0],
      cutCel = cutTimeline.frames[cutTimeline.activeFrame].cels[cutTimeline.activeLayer];
    assert.deepEqual(colorAt(cutCel.pixels, 0, 0), colorAt(pixels, 1, 1));
    assert.deepEqual(
      colorAt(sourceCel.pixels, 1, 1),
      [0, 0, 0, 0],
      "Cut clears selected source pixels",
    );
    assert.deepEqual(
      cutEditor.canvas.exportComposite().data,
      originalCut,
      "Cut layer reproduces the original visible sprite",
    );
    assert.ok(cutState.selection, "Cut keeps the selection visible");
    cutEditor.history.undo();
    assert.equal(cutEditor.getSnapshot().document.timeline.layers.length, 1);
    assert.deepEqual(
      cutEditor.canvas.exportComposite().data,
      originalCut,
      "Undo restores the source pixels",
    );
    cutEditor.history.redo();
    assert.equal(cutEditor.getSnapshot().document.timeline.layers.length, 2);

    const solid = (color) => image(4, 4, () => color);
    const sparse = (base, overrides) => image(4, 4, (x, y) => overrides.get(`${x},${y}`) ?? base);
    const cel = (pixels) => ({ pixels, x: 0, y: 0, opacity: 255, zIndex: 0 });
    const rangeTimeline = () => ({
      composeGroups: false,
      activeFrame: 0,
      activeLayer: 0,
      layers: [
        {
          id: "layer-1",
          name: "Base",
          kind: "image",
          visible: true,
          locked: false,
          opacity: 255,
          flags: 3,
        },
        {
          id: "layer-2",
          name: "Overlay",
          kind: "image",
          visible: true,
          locked: false,
          opacity: 255,
          flags: 3,
        },
        {
          id: "layer-3",
          name: "Outside Range",
          kind: "image",
          visible: true,
          locked: false,
          opacity: 255,
          flags: 3,
        },
      ],
      frames: [
        {
          duration: 100,
          cels: [
            cel(solid([240, 20, 20, 255])),
            cel(sparse([0, 0, 0, 0], new Map([["2,1", [20, 40, 240, 255]]]))),
            cel(solid([20, 220, 20, 255])),
          ],
        },
        {
          duration: 125,
          cels: [
            cel(solid([220, 180, 20, 255])),
            cel(sparse([0, 0, 0, 0], new Map([["1,1", [20, 220, 40, 255]]]))),
            cel(solid([20, 220, 20, 255])),
          ],
        },
        {
          duration: 150,
          cels: [cel(solid([220, 20, 180, 255])), null, cel(solid([20, 220, 20, 255]))],
        },
      ],
      range: undefined,
    });
    const prepareRangeEditor = () => {
      const editor = new RasterEditor();
      editor.document.loadTimeline(rangeTimeline(), 4, 4, "range.aseprite");
      editor.timeline.setTimelineRange({ kind: "cels", frames: [0, 1], layers: [0, 1] });
      editor.drawing.settings.setSettings({ tool: "marquee", selectionMode: "replace" });
      editor.pointerDown({ x: 1, y: 1 });
      editor.pointerUp({ x: 3, y: 3 });
      return editor;
    };
    const rangeCopy = prepareRangeEditor();
    assert.equal(rangeCopy.clipboard.newLayerViaSelection(false), true);
    let rangeState = rangeCopy.getSnapshot().document,
      rangeData = rangeState.timeline;
    assert.equal(rangeData.layers.length, 4);
    assert.deepEqual(
      Array.from(rangeData.frames[0].cels[1].pixels.data.slice(0, 8)),
      [240, 20, 20, 255, 20, 40, 240, 255],
      "Range copy merges selected layers in frame 0",
    );
    assert.deepEqual(
      Array.from(rangeData.frames[1].cels[1].pixels.data.slice(0, 8)),
      [20, 220, 40, 255, 220, 180, 20, 255],
      "Range copy renders selected layers independently for each frame",
    );
    assert.equal(rangeData.frames[2].cels[1], null, "Unselected frames get no copied cel");
    assert.deepEqual(
      colorAt(rangeData.frames[0].cels[1].pixels, 2, 0),
      [240, 20, 20, 255],
      "Unselected visible layers are excluded from the range merge",
    );

    const rangeCut = prepareRangeEditor(),
      rangeBefore = rangeCut.getSnapshot().document.timeline;
    assert.equal(rangeCut.clipboard.newLayerViaSelection(true), true);
    rangeState = rangeCut.getSnapshot().document;
    rangeData = rangeState.timeline;
    assert.deepEqual(
      colorAt(rangeData.frames[0].cels[0].pixels, 1, 1),
      [0, 0, 0, 0],
      "Range Cut clears the selected region in the bottom source layer",
    );
    assert.deepEqual(
      colorAt(rangeData.frames[0].cels[2].pixels, 2, 1),
      [0, 0, 0, 0],
      "Range Cut clears the selected region in the overlay source layer",
    );
    assert.deepEqual(
      colorAt(rangeData.frames[1].cels[0].pixels, 1, 1),
      [0, 0, 0, 0],
      "Range Cut clears each selected frame",
    );
    assert.deepEqual(
      colorAt(rangeData.frames[2].cels[0].pixels, 1, 1),
      colorAt(rangeBefore.frames[2].cels[0].pixels, 1, 1),
      "Range Cut leaves unselected frames unchanged",
    );
    assert.deepEqual(
      colorAt(rangeData.frames[0].cels[1].pixels, 1, 0),
      [20, 40, 240, 255],
      "Range Cut preserves the merged copied cel",
    );
    rangeCut.history.undo();
    assert.equal(rangeCut.getSnapshot().document.timeline.layers.length, 3);
    assert.deepEqual(
      colorAt(rangeCut.getSnapshot().document.timeline.frames[0].cels[0].pixels, 1, 1),
      [240, 20, 20, 255],
      "One undo restores all source cels and removes the range layer",
    );
    rangeCut.history.redo();
    assert.equal(rangeCut.getSnapshot().document.timeline.layers.length, 4);

    const duplicateEditor = new RasterEditor();
    duplicateEditor.document.loadImage(pixels, "duplicate.aseprite", [
      [0, 0, 0, 0],
      [200, 100, 50, 255],
    ]);
    duplicateEditor.timeline.addLayer("Overlay");
    duplicateEditor.timeline.addFrame(false);
    duplicateEditor.timeline.setFrameDuration(175);
    const sourceTimeline = duplicateEditor.getSnapshot().document.timeline,
      project = duplicateEditor.clipboard.duplicateProject();
    assert.equal(project.timeline.layers.length, sourceTimeline.layers.length);
    assert.equal(project.timeline.frames.length, 2);
    assert.equal(project.timeline.frames[1].duration, 175);
    assert.deepEqual(project.palette, duplicateEditor.getSnapshot().document.palette);
    assert.equal(project.image.width, 6);
    assert.equal(project.image.height, 5);
    assert.notEqual(
      project.timeline.frames[0].cels[0].pixels.data,
      sourceTimeline.frames[0].cels[0].pixels.data,
      "Duplicate owns its pixel storage",
    );
    const flattened = duplicateEditor.clipboard.duplicateProject(true);
    assert.equal(flattened.timeline.layers.length, 1, "Merge Layers creates one flattened layer");
    assert.equal(
      flattened.timeline.frames.length,
      sourceTimeline.frames.length,
      "Merge Layers preserves frame count",
    );

    const referenceEditor = new RasterEditor();
    referenceEditor.document.loadImage(pixels, "reference.aseprite");
    assert.equal(
      referenceEditor.sprite.addReferenceLayer(image(2, 1, () => [250, 30, 20, 255])),
      true,
    );
    const referenceTimeline = referenceEditor.getSnapshot().document.timeline,
      referenceLayer = referenceTimeline.layers[referenceTimeline.activeLayer],
      referenceCel = referenceTimeline.frames[0].cels[referenceTimeline.activeLayer];
    assert.ok(
      referenceLayer.flags & 64,
      "Paste as New Reference Layer marks the inserted layer as a reference",
    );
    assert.deepEqual(
      referenceCel.preciseBounds,
      { x: 0, y: 0.5, width: 6, height: 3 },
      "Reference artwork is proportionally fitted and centered",
    );

    console.log(
      "Selection commands pass: Aseprite crop/name, exact-origin copy/cut with undo, merged selected layer/frame ranges, detached duplicate/merge, and centered reference-layer insertion.",
    );
  }, 60_000);
});

describe("auto-select-layer", () => {
  it("auto-select-layer behavior", async () => {
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
    const image = { width: 8, height: 8, data: new Uint8ClampedArray(256) };
    image.data.set([255, 0, 0, 255], (2 * 8 + 2) * 4);
    const e = new RasterEditor(image);
    assert.equal(e.getSnapshot().settings.autoSelectLayer, false);
    e.drawing.settings.setSettings({ tool: "move", autoSelectLayer: true });
    e.pointerDown({ x: 0, y: 0 });
    e.pointerUp({ x: 3, y: 2 });
    assert.equal(e.getSnapshot().document.layer.x, 3);
    assert.equal(e.getSnapshot().canUndo, true);
    e.history.undo();
    e.pointerDown({ x: 2, y: 2 });
    e.pointerUp({ x: 5, y: 4 });
    assert.equal(e.getSnapshot().document.layer.x, 3);
    assert.equal(e.getSnapshot().document.layer.y, 2);
    e.history.undo();
    assert.equal(e.getSnapshot().document.layer.x, 0);
    e.drawing.settings.setSettings({ autoSelectLayer: false });
    e.pointerDown({ x: 0, y: 0 });
    e.pointerUp({ x: 1, y: 1 });
    assert.equal(e.getSnapshot().document.layer.x, 1);
    e.history.undo();
    e.timeline.setLayerLocked(true);
    e.drawing.settings.setSettings({ autoSelectLayer: true });
    e.pointerDown({ x: 2, y: 2 });
    e.pointerUp({ x: 3, y: 3 });
    assert.equal(e.getSnapshot().document.layer.x, 0);
    console.log(
      "Auto-select-layer checks pass: defaultoff, transparentmissretainscurrentlayer, opaquehitmove/undo, uncheckedwholecelmove, lockedlayerprotection.",
    );
  }, 60_000);
});
