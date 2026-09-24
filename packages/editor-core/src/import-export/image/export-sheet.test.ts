import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("tilemap-export", () => {
  it("tilemap-export behavior", async () => {
    const load = async (path) => {
      const { outputFiles } = await build({
        entryPoints: [path],
        bundle: true,
        platform: "node",
        format: "esm",
        write: false,
      });
      return import(
        `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
      );
    };
    const { renderSpriteSheet, defaultSpriteSheetOptions } = await load(
      "packages/editor-core/src/import-export/image/export-sheet.ts",
    );
    const { cloneEditorProject } = await load("packages/editor-core/src/document/project.ts");
    const pixels = { width: 1, height: 1, data: new Uint8ClampedArray([21, 0, 0, 255]) };
    const layer = (id, tilesetId, visible = true) => ({
      id,
      name: id,
      kind: "tilemap",
      tilesetId,
      visible,
      locked: false,
      flags: visible ? 1 : 0,
      opacity: 255,
    });
    const set = (id, red) => ({
      id,
      name: `set${id}`,
      flags: 2,
      tileWidth: 1,
      tileHeight: 1,
      tileCount: 2,
      baseIndex: 1,
      pixels: new Uint8Array([0, 0, 0, 0, red, 0, 0, 255]),
    });
    const cel = {
      pixels,
      x: 0,
      y: 0,
      opacity: 255,
      zIndex: 0,
      tilemap: { width: 1, height: 1, tiles: new Uint32Array([1]) },
    };
    const doc = {
      name: "map.aseprite",
      width: 1,
      height: 1,
      selection: null,
      layer: { name: "a", pixels, x: 0, y: 0, visible: true, locked: false },
      timeline: {
        activeLayer: 0,
        activeFrame: 0,
        layers: [layer("a", 3), layer("b", 3), layer("c", 7, false)],
        frames: [{ duration: 100, cels: [cel, cel, cel] }],
        tilesets: [set(3, 21), set(7, 89)],
      },
    };
    const o = {
      ...defaultSpriteSheetOptions(doc),
      source: "tilesets",
      layout: "horizontal",
      filenameFormat: "{layer}-{frame}",
      dataFormat: "array",
    };
    const before = structuredClone(doc),
      sheet = renderSpriteSheet(doc, o);
    assert.equal(sheet.samples.length, 2, "shared tileset exported once");
    assert.equal(sheet.pixels.width, 2);
    assert.deepEqual([...sheet.pixels.data], [0, 0, 0, 0, 21, 0, 0, 255]);
    assert.deepEqual(
      sheet.data.meta.tilesets.map((s) => s.id),
      [3],
    );
    assert.deepEqual(
      sheet.data.meta.tilesets[0].tiles.map((t) => t.index),
      [0, 1],
    );
    assert.deepEqual(doc, before, "export must not mutate source");
    const selected = {
      ...doc,
      timeline: { ...doc.timeline, range: { kind: "layers", layers: [2], frames: [0] } },
    };
    const hidden = renderSpriteSheet(selected, {
      ...o,
      layers: "selected",
      ignoreEmpty: true,
      scalePercent: 200,
    });
    assert.equal(hidden.samples.length, 1);
    assert.equal(hidden.pixels.width, 2);
    assert.equal(hidden.pixels.height, 2);
    assert.deepEqual(
      hidden.data.meta.tilesets.map((s) => s.id),
      [7],
    );
    assert.equal(hidden.data.meta.tilesets[0].tiles[0].index, 1);
    assert.deepEqual(
      Array.from(hidden.pixels.data.filter((_, i) => i % 4 === 0)),
      [89, 89, 89, 89],
    );
    assert.throws(
      () => renderSpriteSheet({ ...doc, timeline: { ...doc.timeline, layers: [] } }, o),
      /No tiles/,
    );
    assert.throws(() => renderSpriteSheet(doc, { ...o, scalePercent: 1e9 }), /budget/);
    const project = { image: pixels, timeline: doc.timeline },
      clone = cloneEditorProject(project);
    clone.timeline.tilesets[0].pixels.fill(0);
    clone.timeline.frames[0].cels[0].tilemap.tiles.fill(0);
    assert.equal(doc.timeline.tilesets[0].pixels[4], 21);
    assert.equal(cel.tilemap.tiles[0], 1);
    assert.equal(
      clone.timeline.frames[0].cels[0],
      clone.timeline.frames[0].cels[1],
      "snapshot retains shared cel topology",
    );
    console.log(
      "Tilemap export: shared tileset deduplication, visibility/selection, tile identity, scaling, empty filtering, resource limits and detached snapshots passed.",
    );
  }, 60_000);
});
