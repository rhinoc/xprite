import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("tilemap-editor-v2", () => {
  it("tilemap-editor-v2 behavior", async () => {
    const bundle = await build({
      entryPoints: ["packages/editor-core/src/index.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const m = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
    );
    const pixels = new Uint8Array(10 * 2 * 2 * 4);
    for (let tile = 1; tile < 10; tile++)
      for (let p = 0; p < 4; p++) pixels.set([tile * 20, p * 40, 100, 255], (tile * 4 + p) * 4);
    const set = {
      id: 3,
      name: "Terrain",
      flags: 6,
      baseIndex: 1,
      tileWidth: 2,
      tileHeight: 2,
      tileCount: 10,
      pixels,
    };
    const grid = { width: 3, height: 3, tiles: Uint32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
    const t = m.refreshTilemapProjections({
      colorDepth: 32,
      tilesets: [set],
      layers: [
        {
          id: "map",
          name: "Map",
          kind: "tilemap",
          tilesetId: 3,
          visible: true,
          locked: false,
          flags: 3,
          opacity: 255,
        },
      ],
      frames: [
        {
          duration: 100,
          cels: [
            {
              x: 0,
              y: 0,
              opacity: 255,
              zIndex: 0,
              tilemap: grid,
              pixels: { width: 6, height: 6, data: new Uint8ClampedArray(144) },
            },
          ],
        },
      ],
      activeFrame: 0,
      activeLayer: 0,
    });
    const e = new m.RasterEditor();
    e.document.loadTimeline(t, 12, 12, "Tile transforms");
    const doc = () => e.getSnapshot().document,
      map = () => doc().timeline.frames[0].cels[0].tilemap;
    const snapshot = () => e.getPersistenceSnapshot();
    const select = () => {
      e.tilemap.setTilemapMode(m.TilemapDisplayMode.Tiles);
      e.drawing.settings.setSettings({ tool: "marquee" });
      e.pointerDown({ x: 0, y: 0 });
      e.pointerMove({ x: 4, y: 4 });
      e.pointerUp();
      assert.deepEqual([doc().selection.width, doc().selection.height], [6, 6]);
    };
    select();
    e.history.markSaved();
    const before = snapshot();
    assert.equal(e.selection.beginTransform("e", { x: 6, y: 3 }), true);
    e.pointerMove({ x: 10, y: 3 });
    assert.deepEqual([map().width, map().height], [5, 3]);
    assert.deepEqual([...map().tiles], [1, 2, 2, 2, 3, 4, 5, 5, 5, 6, 7, 8, 8, 8, 9]);
    // In-progress transforms do not leak into autosave. Cancelling restores the graph.
    assert.deepEqual(snapshot(), before);
    e.cancelPointerGesture();
    assert.deepEqual([...map().tiles], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(e.getSnapshot().dirty, false);
    e.selection.beginTransform("e", { x: 6, y: 3 });
    e.pointerUp({ x: 10, y: 3 });
    assert.equal(map().width, 5);
    e.history.undo();
    assert.equal(map().width, 3);
    e.history.redo();
    assert.equal(map().width, 5);
    e.history.undo();
    e.selection.flipSelection("horizontal");
    assert.deepEqual([...map().tiles], [3, 2, 1, 6, 5, 4, 9, 8, 7]);
    assert.deepEqual(
      doc().timeline.tilesets[0].pixels,
      pixels,
      "selection flip moves references, not shared tile pixels",
    );
    e.history.undo();
    assert.equal(e.selection.beginTransform("rotate-ne", { x: 6, y: 0 }), false);
    assert.match(e.getSnapshot().status, /Tiles mode.*rotation/);
    assert.equal(m.resolveShortcut({ key: "h", shift: true }).type, "flip-selection-horizontal");
    m.executeEditorCommand(
      e,
      { type: "flip-selection-vertical" },
      { scene: "document", viewport: { width: 100, height: 100 } },
    );
    assert.deepEqual([...map().tiles], [7, 8, 9, 4, 5, 6, 1, 2, 3]);
    e.history.undo();
    e.selection.deselect();
    e.history.markSaved();
    const structural = snapshot();
    e.imageEditing.rotateCanvas(90);
    assert.equal(doc().timeline.layers[0].kind, "tilemap");
    assert.deepEqual([...map().tiles], [7, 4, 1, 8, 5, 2, 9, 6, 3]);
    e.history.undo();
    assert.deepEqual(snapshot().document.timeline.frames, structural.document.timeline.frames);
    e.imageEditing.resizeSprite(24, 24, "nearest");
    assert.equal(doc().timeline.tilesets[0].tileWidth, 4);
    assert.equal(map().width, 3);
    e.history.undo();
    assert.equal(doc().width, 12);
    e.imageEditing.resizeCanvas({ x: 1, y: 1, width: 3, height: 3 }, true);
    assert.ok(map().width <= 3);
    assert.equal(doc().timeline.layers[0].kind, "tilemap");
    e.history.undo();
    assert.deepEqual(doc().timeline.frames, structural.document.timeline.frames);
    // Effects are real graph edits with undo; previews are detached and recoverable.
    e.tilemap.setTilesetMode(m.TilesetMode.Stack);
    const effectBefore = snapshot();
    e.imageEditing.previewEffect({ kind: "invert" });
    assert.deepEqual(snapshot(), effectBefore);
    assert.notDeepEqual(e.canvas.previewComposite(), e.canvas.composite());
    e.imageEditing.previewEffect(null);
    e.imageEditing.applyEffect({ kind: "invert" });
    assert.notDeepEqual(
      doc().timeline.tilesets[0].pixels,
      effectBefore.document.timeline.tilesets[0].pixels,
    );
    e.history.undo();
    assert.deepEqual(doc().timeline.frames, effectBefore.document.timeline.frames);
    e.history.redo();
    const saved = m.asepriteFromProject(m.projectFromDocument(doc())),
      bytes = m.encodeAsepriteSync(saved),
      reopened = m.projectFromAseprite(m.decodeAsepriteSync(bytes));
    assert.deepEqual(reopened.image, e.canvas.composite());
    assert.equal(reopened.timeline.layers[0].kind, "tilemap");
    // Public resize failure is atomic, and the next operation has no stale transaction.
    const stable = snapshot();
    assert.throws(() => e.imageEditing.resizeSprite(999999, 999999));
    assert.deepEqual(snapshot(), stable);
    e.selection.flipSelection("vertical");
    e.imageEditing.resizeCanvas({ x: 0, y: 0, width: 14, height: 14 });
    assert.equal(doc().width, 14);
    e.history.undo();
    assert.equal(doc().width, 12);
    // Ordinary pixel selection flip preserves alpha and does not regress non-Tilemap editing.
    const raster = new m.RasterEditor({
      width: 2,
      height: 1,
      data: Uint8ClampedArray.from([10, 20, 30, 255, 80, 90, 100, 128]),
    });
    raster.selection.selectAll();
    raster.selection.flipSelection("horizontal");
    assert.deepEqual([...raster.canvas.composite().data], [80, 90, 100, 128, 10, 20, 30, 255]);
    raster.history.undo();
    assert.deepEqual([...raster.canvas.composite().data], [10, 20, 30, 255, 80, 90, 100, 128]);
    // Empty source cells are transparent when moving over another occupied tile.
    const holes = new m.RasterEditor();
    const ht = m.refreshTilemapProjections({
      ...t,
      frames: [
        {
          ...t.frames[0],
          cels: [
            {
              ...t.frames[0].cels[0],
              tilemap: { width: 4, height: 1, tiles: Uint32Array.of(1, 0, 2, 3) },
            },
          ],
        },
      ],
    });
    holes.document.loadTimeline(ht, 12, 4, "Tile holes");
    holes.tilemap.setTilemapMode(m.TilemapDisplayMode.Tiles);
    holes.drawing.settings.setSettings({ tool: "marquee" });
    holes.pointerDown({ x: 0, y: 0 });
    holes.pointerMove({ x: 2, y: 0 });
    holes.pointerUp();
    holes.selection.nudgeSelection(4, 0);
    assert.deepEqual(
      [...holes.getSnapshot().document.timeline.frames[0].cels[0].tilemap.tiles],
      [0, 0, 1, 3],
    );
    holes.history.undo();
    assert.deepEqual(
      [...holes.getSnapshot().document.timeline.frames[0].cels[0].tilemap.tiles],
      [1, 0, 2, 3],
    );
    // A partial-pixel selection keeps its original mask when switching to Tiles mode.
    const partial = new m.RasterEditor();
    partial.document.loadTimeline(t, 12, 12, "Partial mask");
    partial.tilemap.setTilemapMode(m.TilemapDisplayMode.Pixels);
    partial.drawing.settings.setSettings({ tool: "marquee" });
    partial.pointerDown({ x: 1, y: 1 });
    partial.pointerMove({ x: 3, y: 3 });
    partial.pointerUp();
    partial.tilemap.setTilemapMode(m.TilemapDisplayMode.Tiles);
    const pm = partial.getSnapshot().document.selection;
    assert.equal(
      pm.data.reduce((sum, v) => sum + !!v, 0),
      9,
    );
    partial.selection.flipSelection("horizontal");
    assert.equal(
      partial.getSnapshot().document.selection.data.reduce((sum, v) => sum + !!v, 0),
      9,
      "Do not turn a partial mask into whole-cell selection",
    );
    partial.history.undo();
    assert.deepEqual(partial.getSnapshot().document.selection, pm);
    // Selection-only changes on Tilemap layers must not mark source content dirty.
    const clean = new m.RasterEditor();
    clean.document.loadTimeline(t, 12, 12, "Clean selection");
    clean.history.markSaved();
    clean.selection.selectAll();
    assert.equal(clean.getSnapshot().dirty, false);
    clean.selection.deselect();
    assert.equal(clean.getSnapshot().dirty, false);
    clean.selection.selectAll();
    clean.selection.beginTransform("e", { x: 12, y: 6 });
    clean.pointerUp({ x: 12, y: 6 });
    assert.equal(clean.getSnapshot().dirty, false);
    console.log(
      "Tilemap v2 editor: tile resize/flip/rotation guard, cancel/undo/autosave, sprite transforms, effects preview/history and ASE reopen pass.",
    );
  }, 60_000);
});

describe("tilemap-model", () => {
  it("tilemap-model behavior", async () => {
    const bundle = await build({
      stdin: {
        contents:
          'export * from "./packages/editor-core/src/tilemap/model.ts";export * from "./packages/editor-core/src/timeline/timeline.ts";export * from "./packages/editor-core/src/import-export/aseprite/project.ts";export * from "./packages/editor-core/src/import-export/aseprite/index.ts";',
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const m = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
    );
    const rgba = (values) => new Uint8Array(values.flatMap((v) => [v, 0, 0, v ? 255 : 0]));
    const set = {
      id: 0,
      name: "test",
      flags: 6,
      tileWidth: 2,
      tileHeight: 3,
      tileCount: 2,
      baseIndex: 1,
      pixels: rgba([0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6]),
    };
    const red = (p) => Array.from(p.data).filter((_, i) => i % 4 === 0);
    assert.deepEqual(
      red(
        m.rasterizeTilemap(
          { width: 1, height: 1, tiles: Uint32Array.of(1 | m.TILE_DIAGONAL_FLIP) },
          set,
        ),
      ),
      [1, 3, 2, 4, 0, 0],
    );
    assert.deepEqual(
      red(
        m.rasterizeTilemap({ width: 1, height: 1, tiles: Uint32Array.of(1 | m.TILE_X_FLIP) }, set),
      ),
      [2, 1, 4, 3, 6, 5],
    );
    let t = m.createTilemapLayer(
      { layers: [], frames: [{ duration: 100, cels: [] }], activeLayer: 0, activeFrame: 0 },
      { tileWidth: 1, tileHeight: 1 },
    );
    t = { ...t, tilesets: [{ ...t.tilesets[0], tileCount: 3, pixels: rgba([0, 10, 20]) }] };
    t = m.setTilesAt(t, 0, 0, [
      { x: 0, y: 0, tile: 1 },
      { x: 1, y: 0, tile: 1 },
    ]);
    const old = t;
    let painted = { ...t.frames[0].cels[0].pixels, data: rgba([30, 10]) };
    let manual = m.commitTilemapPixels(t, 0, 0, painted, 0, 0, "manual");
    assert.deepEqual(red(manual.frames[0].cels[0].pixels), [30, 30]);
    assert.deepEqual(red(old.frames[0].cels[0].pixels), [10, 10]);
    let stack = m.commitTilemapPixels(t, 0, 0, painted, 0, 0, "stack");
    assert.deepEqual(red(stack.frames[0].cels[0].pixels), [30, 10]);
    assert.equal(stack.tilesets[0].tileCount, 4);
    stack = m.commitTilemapPixels(stack, 0, 0, { ...painted, data: rgba([20, 10]) }, 0, 0, "stack");
    assert.equal(stack.tilesets[0].tileCount, 4, "Stack reuses matching existing tile");
    let auto = m.commitTilemapPixels(t, 0, 0, { ...painted, data: rgba([30, 30]) }, 0, 0, "auto");
    assert.equal(
      auto.tilesets[0].tileCount,
      3,
      "Auto removes newly unused modified tile but retains unrelated unused tile",
    );
    assert.deepEqual(red(auto.frames[0].cels[0].pixels), [30, 30]);
    const unique = m.setTileAt(t, 0, 0, 1, 0, 2);
    const uniqueEdit = m.commitTilemapPixels(
      unique,
      0,
      0,
      { ...painted, data: rgba([30, 20]) },
      0,
      0,
      "auto",
    );
    assert.equal(uniqueEdit.tilesets[0].tileCount, 3);
    assert.deepEqual(
      [...uniqueEdit.frames[0].cels[0].tilemap.tiles],
      [1, 2],
      "Auto reuses uniquely referenced tile ID",
    );
    let grown = m.setTilesAt(t, 0, 0, [
      { x: -1, y: -1, tile: 2 },
      { x: 2, y: 1, tile: 2 },
    ]);
    assert.equal(grown.frames[0].cels[0].x, -1);
    assert.equal(grown.frames[0].cels[0].y, -1);
    assert.equal(grown.frames[0].cels[0].tilemap.width, 4);
    const linked = { ...t, frames: [t.frames[0], { ...t.frames[0] }] };
    const changed = m.setTileAt(linked, 0, 0, 0, 0, 2);
    assert.equal(changed.frames[0].cels[0].tilemap, changed.frames[1].cels[0].tilemap);
    assert.equal(changed.frames[0].cels[0].pixels, changed.frames[1].cels[0].pixels);
    const deleted = m.deleteTilesetTile(linked, 0, 1);
    assert.deepEqual([...deleted.frames[1].cels[0].tilemap.tiles], [0, 0]);
    for (const name of [
      "2x2tilemap2x2tile.aseprite",
      "2x3tilemap-indexed.aseprite",
      "3x2tilemap-grayscale.aseprite",
    ]) {
      const file = resolve(
        process.env.ASEPRITE_SOURCE ??
          fileURLToPath(new URL("../../../../.refs/aseprite", import.meta.url)),
        "tests/sprites",
        name,
      );
      let bytes;
      try {
        bytes = await readFile(file);
      } catch {
        console.log(`SKIP Aseprite fixture ${file}`);
        continue;
      }
      const sprite = await m.decodeAseprite(bytes),
        project = m.projectFromAseprite(sprite),
        saved = m.asepriteFromProject(project),
        reopened = m.projectFromAseprite(await m.decodeAseprite(await m.encodeAseprite(saved)));
      assert.deepEqual(reopened.image, project.image, `${name}: Aseprite color render round-trip`);
      assert.equal(reopened.timeline.tilesets.length, project.timeline.tilesets.length);
      for (let fi = 0; fi < project.timeline.frames.length; fi++)
        for (let li = 0; li < project.timeline.layers.length; li++)
          assert.deepEqual(
            reopened.timeline.frames[fi].cels[li]?.tilemap,
            project.timeline.frames[fi].cels[li]?.tilemap,
          );
    }
    let sparse = m.createTilemapLayer(
      { layers: [], frames: [{ duration: 100, cels: [] }], activeLayer: 0, activeFrame: 0 },
      { tileWidth: 1, tileHeight: 1 },
    );
    const sparsePixels = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) };
    sparsePixels.data.set([50, 0, 0, 255], (3 * 8 + 2) * 4);
    sparse = m.commitTilemapPixels(sparse, 0, 0, sparsePixels, 0, 0, "auto");
    assert.equal(sparse.frames[0].cels[0].tilemap.width, 1);
    assert.equal(sparse.frames[0].cels[0].tilemap.height, 1);
    assert.equal(sparse.frames[0].cels[0].x, 2);
    assert.equal(sparse.frames[0].cels[0].y, 3);
    const sparseLinked = {
      ...sparse,
      frames: [
        sparse.frames[0],
        { ...sparse.frames[0], cels: [{ ...sparse.frames[0].cels[0], x: 10, y: 20 }] },
      ],
    };
    const grownSparse = m.setTileAt(sparseLinked, 0, 0, -2, -1, 0);
    const trimmed = m.trimTilemapCel(grownSparse, 0, 0);
    assert.equal(trimmed.frames[1].cels[0].x, 10);
    assert.equal(trimmed.frames[1].cels[0].y, 20);
    assert.equal(trimmed.frames[0].cels[0].tilemap, trimmed.frames[1].cels[0].tilemap);
    let flip = m.createTilemapLayer(
      { layers: [], frames: [{ duration: 100, cels: [] }], activeLayer: 0, activeFrame: 0 },
      { tileWidth: 2, tileHeight: 1 },
    );
    flip = {
      ...flip,
      tilesets: [{ ...flip.tilesets[0], flags: 14, tileCount: 2, pixels: rgba([0, 0, 10, 20]) }],
    };
    flip = m.setTileAt(flip, 0, 0, 0, 0, 1);
    const flipped = m.commitTilemapPixels(
      flip,
      0,
      0,
      { width: 2, height: 1, data: rgba([20, 10]) },
      0,
      0,
      "stack",
    );
    assert.equal(flipped.tilesets[0].tileCount, 2);
    assert.equal(flipped.frames[0].cels[0].tilemap.tiles[0], (1 | m.TILE_X_FLIP) >>> 0);
    m.assertTilemapTimeline(flipped);
    assert.throws(() => m.assertTilemapTimeline({ ...flipped, tilesets: [] }), /missing Tileset/);
    assert.throws(
      () =>
        m.assertTilemapTimeline({
          ...flipped,
          tilesets: [flipped.tilesets[0], flipped.tilesets[0]],
        }),
      /duplicate/,
    );
    console.log(
      "Tilemap model: flips, copy-on-write, Manual/Auto/Stack, linked edits, bounds, deletion and Aseprite fixture round-trips pass.",
    );
  }, 60_000);
});

describe("tilemap-editor", () => {
  it("tilemap-editor behavior", async () => {
    const b = await build({
      stdin: {
        contents:
          'export * from "./packages/editor-core/src/index.ts";export * from "./packages/editor-core/src/tilemap/model.ts";export * from "./apps/editor/src/adapters/workers/recovery-codec.ts";',
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const m = await import(
      `data:text/javascript;base64,${Buffer.from(b.outputFiles[0].contents).toString("base64")}`
    );
    const blank = { width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4) };
    const e = new m.RasterEditor(blank);
    const doc = () => e.getSnapshot().document,
      t = () => doc().timeline,
      cel = () => t().frames[t().activeFrame].cels[t().activeLayer],
      set = () => t().tilesets[0];
    const red = [230, 10, 0, 255],
      blue = [5, 20, 240, 255];
    const paint = (x, y, color = red) => {
      e.drawing.settings.setSettings({ tool: "pencil", foreground: color });
      e.pointerDown({ x, y });
      e.pointerUp();
    };
    const pixel = (x, y) =>
      Array.from(e.canvas.composite().data.slice((y * 16 + x) * 4, (y * 16 + x) * 4 + 4));
    e.tilemap.addTilemapLayer({ tileWidth: 2, tileHeight: 2, tilesetName: "Terrain" });
    assert.equal(t().layers[t().activeLayer].kind, "tilemap");
    assert.equal(e.getSnapshot().settings.tilemapMode, m.TilemapDisplayMode.Pixels);
    paint(0, 0);
    assert.equal(set().tileCount, 2);
    assert.deepEqual(pixel(0, 0), red);
    assert.equal(cel().tilemap.tiles[0], 1);
    e.tilemap.setTilemapMode(m.TilemapDisplayMode.Tiles);
    e.tilemap.setSelectedTile(1);
    paint(2, 0);
    assert.deepEqual(Array.from(cel().tilemap.tiles.slice(0, 2)), [1, 1]);
    assert.equal(set().tileCount, 2);
    assert.deepEqual(pixel(2, 0), red);
    e.history.undo();
    assert.equal(cel().tilemap.tiles[1] ?? 0, 0);
    e.history.redo();
    assert.deepEqual(Array.from(cel().tilemap.tiles.slice(0, 2)), [1, 1]);
    e.tilemap.setTilemapMode(m.TilemapDisplayMode.Pixels);
    e.tilemap.setTilesetMode(m.TilesetMode.Manual);
    paint(0, 0, blue);
    assert.deepEqual(pixel(0, 0), blue);
    assert.deepEqual(pixel(2, 0), blue);
    e.history.undo();
    assert.deepEqual(pixel(2, 0), red);
    e.history.redo();
    assert.deepEqual(pixel(2, 0), blue);
    e.tilemap.setTilesetMode(m.TilesetMode.Stack);
    paint(0, 0, red);
    assert.deepEqual(pixel(0, 0), red);
    assert.deepEqual(pixel(2, 0), blue);
    assert.equal(set().tileCount, 3);
    e.tilemap.setTilemapMode(m.TilemapDisplayMode.Tiles);
    e.tilemap.setSelectedTile(1);
    e.drawing.settings.setSettings({ tool: "move" });
    e.pointerDown({ x: 0, y: 0 });
    e.pointerMove({ x: 2, y: 2 });
    e.pointerUp();
    assert.equal(cel().x, 2);
    assert.equal(cel().y, 2);
    e.history.undo();
    assert.equal(cel().x, 0);
    // A normal duplicate frame owns its grid while retaining its shared Tileset.
    e.timeline.addFrame(true);
    const first = t().frames[0].cels[t().activeLayer].tilemap;
    assert.notEqual(cel().tilemap, first);
    e.drawing.settings.setSettings({ tool: "eraser" });
    e.pointerDown({ x: 0, y: 0 });
    e.pointerUp();
    assert.notEqual(first.tiles[0], 0);
    e.history.undo();
    e.timeline.deleteFrame();
    // Copy/paste, tile selection move, delete, and complete undo preserve indices.
    e.drawing.settings.setSettings({ tool: "marquee" });
    e.pointerDown({ x: 0, y: 0 });
    e.pointerMove({ x: 2, y: 0 });
    e.pointerUp();
    assert.equal(doc().selection.width, 4);
    assert.equal(doc().selection.height, 2);
    const clip = e.clipboard.copySelection();
    assert.ok(clip.tilemap);
    assert.equal(clip.tilemap.map.width, 2);
    assert.equal(e.clipboard.beginImagePaste(clip, { x: 0, y: 4 }), true);
    assert.equal(cel().tilemap.tiles[2 * cel().tilemap.width], clip.tilemap.map.tiles[0]);
    assert.equal(e.selection.nudgeSelection(2, 0), true);
    assert.equal(doc().selection.x, 2);
    e.history.undo();
    assert.equal(doc().selection.x, 0);
    e.selection.clearSelectionPixels();
    assert.equal(cel().tilemap.tiles[2 * cel().tilemap.width], 0);
    e.history.undo();
    assert.notEqual(cel().tilemap.tiles[2 * cel().tilemap.width], 0);
    const snapshot = e.getPersistenceSnapshot();
    assert.ok(snapshot.document.timeline.tilesets);
    e.tilemap.setSelectedTile(0);
    e.drawing.settings.setSettings({ tool: "eraser" });
    paint(0, 0);
    assert.notEqual(
      snapshot.document.timeline.frames[0].cels[t().activeLayer].tilemap.tiles,
      cel().tilemap.tiles,
    );
    const restored = new m.RasterEditor();
    restored.restorePersistenceSnapshot(snapshot);
    assert.deepEqual(
      restored.canvas.composite(),
      m.projectFromAseprite(
        m.asepriteFromProject({
          image: { width: 16, height: 16, data: new Uint8ClampedArray(1024) },
          timeline: snapshot.document.timeline,
          palette: snapshot.document.palette,
        }),
      ).image,
    );
    // Pending pixel edits appear in both canvas rendering paths, and cancel is atomic.
    const live = new m.RasterEditor(blank);
    live.tilemap.addTilemapLayer({ tileWidth: 2, tileHeight: 2 });
    live.drawing.settings.setSettings({ tool: "pencil", foreground: red });
    live.pointerDown({ x: 3, y: 3 });
    assert.equal(live.canvas.composite().data[(3 * 16 + 3) * 4], 230);
    assert.equal(
      live.canvas.previewViewport({ x: 0, y: 0, width: 16, height: 16, zoom: 1 }).data[
        (3 * 16 + 3) * 4
      ],
      230,
    );
    live.cancelPointerGesture();
    assert.equal(live.canvas.composite().data[(3 * 16 + 3) * 4], 0);
    const colors = new m.RasterEditor(blank);
    colors.tilemap.addTilemapLayer({ tileWidth: 2, tileHeight: 2 });
    colors.drawing.settings.setSettings({ tool: "pencil", foreground: red });
    colors.pointerDown({ x: 0, y: 0 });
    colors.pointerUp();
    colors.tilemap.setTilemapMode(m.TilemapDisplayMode.Tiles);
    colors.tilemap.setBackgroundTile(1);
    colors.pointerDown({ x: 4, y: 0, button: 2 });
    colors.pointerUp();
    assert.equal(
      colors.getSnapshot().document.timeline.frames[0].cels[1].tilemap.tiles[2],
      1,
      "right button paints background tile",
    );
    colors.tilemap.setSelectedTile((1 | 0x80000000) >>> 0);
    m.executeEditorCommand(
      colors,
      { type: "transform-tile", transform: "rotate-cw" },
      { scene: "document", viewport: { width: 16, height: 16 } },
    );
    assert.equal(colors.getSnapshot().settings.selectedTile, (1 | 0xe0000000) >>> 0);
    console.log(
      "Tilemap editor: Pixels/Tiles, shared Manual, Stack, frame isolation, movement, selection clipboard, undo/redo, recovery and live/cancel previews pass.",
    );
  }, 60_000);
});

describe("tilemap-integration", () => {
  it("tilemap-integration behavior", async () => {
    const { outputFiles } = await build({
      stdin: {
        contents: `export * from './packages/editor-core/src/tilemap/model.ts';export * from './packages/editor-core/src/timeline/operations/timeline-range.ts';export * from './packages/editor-core/src/image-editing/effects.ts';export * from './packages/editor-core/src/timeline/layer-operations.ts';export * from './packages/editor-core/src/image-editing/transform.ts';export * from './packages/editor-core/src/image-editing/size.ts';export * from './packages/editor-core/src/color/operations/color-mode.ts';export * from './packages/editor-core/src/color/conversion.ts';export * from './packages/editor-core/src/session/recent-images.ts';`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const core = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const set = {
      id: 0,
      flags: 6,
      name: "Terrain",
      tileWidth: 2,
      tileHeight: 1,
      tileCount: 2,
      baseIndex: 1,
      pixels: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 255, 0, 255, 0, 255]),
    };
    const map = { width: 2, height: 1, tiles: Uint32Array.of(1, 0) };
    const cel = {
      tilemap: map,
      pixels: { width: 4, height: 1, data: new Uint8ClampedArray(16) },
      x: 0,
      y: 0,
      opacity: 255,
      zIndex: 0,
    };
    const t = core.refreshTilemapProjections({
      colorDepth: 32,
      tilesets: [set],
      activeFrame: 0,
      activeLayer: 0,
      layers: [
        {
          id: "a",
          name: "Map",
          kind: "tilemap",
          tilesetId: 0,
          flags: 3,
          visible: true,
          locked: false,
          opacity: 255,
        },
      ],
      frames: [
        { duration: 100, cels: [cel] },
        { duration: 100, cels: [cel] },
      ],
    });
    const doc = () => ({
      width: 4,
      height: 1,
      timeline: t,
      selection: null,
      layer: { ...t.frames[0].cels[0] },
    });
    const copy = core.duplicateLayers(t);
    assert.equal(copy.layers[1].tilesetId, 0);
    assert.equal(copy.tilesets, t.tilesets);
    assert.notEqual(copy.frames[0].cels[1].tilemap, map);
    assert.equal(copy.frames[0].cels[1].tilemap, copy.frames[1].cels[1].tilemap);
    const clone = core.cloneAsepriteImageGraph(t);
    assert.notEqual(clone.tilesets[0].pixels, set.pixels);
    assert.notEqual(clone.frames[0].cels[0].tilemap.tiles, map.tiles);
    assert.equal(clone.frames[0].cels[0].tilemap, clone.frames[1].cels[0].tilemap);
    const recovery = core.cloneEditorProject({ image: t.frames[0].cels[0].pixels, timeline: t });
    assert.notEqual(recovery.timeline.tilesets[0].pixels, set.pixels);
    assert.equal(
      recovery.timeline.frames[0].cels[0].tilemap,
      recovery.timeline.frames[1].cels[0].tilemap,
    );
    const flipped = doc();
    core.flipDocumentCanvas(flipped, "horizontal");
    assert.deepEqual([...flipped.timeline.frames[0].cels[0].tilemap.tiles], [0, 1]);
    assert.deepEqual(
      [...flipped.layer.pixels.data],
      [0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 255, 0, 255, 0, 255],
    );
    assert.equal(flipped.layer.x, 2, "Aseprite canvas flip offsets by map cell width");
    assert.equal(map.tiles[0], 1);
    const merged = core.mergeDown({ ...copy, activeLayer: 1 });
    assert.equal(merged.layers[0].kind, "image");
    assert.equal(merged.layers[0].tilesetId, undefined);
    assert.equal(merged.frames[0].cels[0].tilemap, undefined);
    const moved = doc();
    core.resizeDocumentCanvas(moved, { x: -2, y: 0, width: 8, height: 1 });
    assert.equal(moved.timeline.frames[0].cels[0].tilemap, map);
    assert.equal(moved.layer.x, 2);
    for (const action of [
      (d) => core.resizeDocumentSprite(d, 8, 2),
      (d) => core.rotateDocumentCanvas(d, 90),
      (d) => core.resizeDocumentCanvas(d, { x: 1, y: 0, width: 2, height: 1 }, true),
    ]) {
      const d = doc();
      action(d);
      assert.notEqual(d.timeline, t);
      assert.equal(d.timeline.layers[0].kind, "tilemap");
    }
    const converted = doc();
    core.convertDocumentColorMode(converted, 16);
    assert.equal(converted.timeline.tilesets[0].asepritePixels.length, 8);
    assert.equal(converted.timeline.frames[0].cels[0].asepriteSamples, undefined);
    assert.equal(converted.timeline.frames[0].cels[0].tilemap, map);
    assert.equal(converted.layer.pixels.data[0], converted.layer.pixels.data[1]);
    const palette = [
      [0, 0, 0, 0],
      [255, 0, 0, 255],
      [0, 255, 0, 255],
    ];
    const indexed = doc();
    core.convertDocumentColorMode(indexed, 8, { palette });
    core.updateAsepriteFramePalette(indexed, [
      [0, 0, 0, 0],
      [0, 0, 255, 255],
      [255, 255, 0, 255],
    ]);
    assert.deepEqual(
      Array.from(indexed.layer.pixels.data.slice(0, 8)),
      [0, 0, 255, 255, 255, 255, 0, 255],
    );
    assert.equal(indexed.timeline.frames[0].cels[0].asepriteSamples, undefined);
    console.log(
      "Tilemap integration: cloning, linked grids, duplicate/merge, canvas flip/offset, structured transforms and Tileset color/palette conversion pass.",
    );

    const range = { kind: "cels", frames: [0], layers: [0] };
    const transferred = core.transferTimelineRange(t, range, 1, 0, true);
    assert.notEqual(transferred.frames[1].cels[0].tilemap, map);
    assert.deepEqual([...transferred.frames[1].cels[0].tilemap.tiles], [1, 0]);
    const incompatible = {
      ...copy,
      layers: [copy.layers[0], { ...copy.layers[1], kind: "image", tilesetId: undefined }],
    };
    assert.equal(core.transferTimelineRange(incompatible, range, 0, 1, false), incompatible);
    const otherSet = { ...copy, layers: [copy.layers[0], { ...copy.layers[1], tilesetId: 1 }] };
    assert.equal(core.transferTimelineRange(otherSet, range, 0, 1, false), otherSet);
    const effectDoc = doc();
    assert.equal(core.canOpenEffect(effectDoc), true);
    const effect = core.applyDocumentEffect(effectDoc, { kind: "invert" }, "all");
    assert.notEqual(effect, effectDoc);
    assert.ok(effect.timeline.frames[0].cels[0].tilemap);
    assert.notDeepEqual(effect.timeline.tilesets[0].pixels, effectDoc.timeline.tilesets[0].pixels);
    console.log(
      "Tilemap transfer copy isolation, invalid-layer guards, and authoritative effect commit pass.",
    );
  }, 60_000);
});
