import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("tilemap-clipboard", () => {
  it("tilemap-clipboard behavior", async () => {
    const { outputFiles } = await build({
      stdin: {
        contents: `export * from './packages/editor-core/src/clipboard/image.ts';export * from './packages/editor-core/src/clipboard/timeline.ts';export * from './packages/editor-core/src/import-export/aseprite/profile-clipboard.ts';export * from './packages/editor-core/src/tilemap/model.ts';`,
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
    const set = (r, b) => ({
      id: 0,
      name: "Tiles",
      flags: 6,
      tileWidth: 2,
      tileHeight: 1,
      tileCount: 2,
      baseIndex: 1,
      pixels: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, r, 0, b, 255, r, 0, b, 255]),
    });
    function doc(s) {
      const map = { width: 2, height: 1, tiles: Uint32Array.of(1, 0) },
        pixels = m.rasterizeTilemap(map, s),
        layer = {
          id: "map",
          name: "Map",
          kind: "tilemap",
          tilesetId: 0,
          flags: 3,
          visible: true,
          locked: false,
          opacity: 255,
        };
      return {
        width: 8,
        height: 4,
        layer: { ...layer, pixels, x: 0, y: 0 },
        selection: { x: 1, y: 0, width: 1, height: 1, data: Uint8Array.of(255) },
        timeline: {
          colorDepth: 32,
          layers: [layer],
          tilesets: [s],
          frames: [
            {
              duration: 100,
              cels: [{ pixels, tilemap: map, x: 0, y: 0, opacity: 255, zIndex: 0 }],
            },
          ],
          activeFrame: 0,
          activeLayer: 0,
        },
      };
    }
    const source = doc(set(255, 0)),
      copy = m.copyDocumentSelection(source, false, true);
    assert.equal(copy.pixels.width, 2);
    assert.deepEqual([...copy.mask.data], [255, 255]);
    const clone = m.cloneClipboardImage(copy);
    clone.tilemap.map.tiles[0] = 0;
    assert.equal(copy.tilemap.map.tiles[0], 1);
    const target = doc(set(0, 255)),
      before = target.timeline;
    assert.equal(m.pasteTilemapClipboard(target, copy, { x: 2, y: 0 }), true);
    assert.deepEqual([...target.timeline.frames[0].cels[0].tilemap.tiles], [1, 2]);
    assert.equal(target.timeline.tilesets[0].tileCount, 3);
    assert.equal(before.tilesets[0].tileCount, 2);
    m.pasteTilemapClipboard(target, copy, { x: 2, y: 0 });
    assert.equal(target.timeline.tilesets[0].tileCount, 3);
    const range = m.copyTimelineSelection(source.timeline, {
      kind: "cels",
      layers: [0],
      frames: [0],
    });
    const result = m.pasteTimelineClipboard(before, range);
    assert.equal(result.frames[0].cels[0].tilemap.tiles[0], 2);
    assert.equal(result.tilesets[0].pixels[16], 255);
    const layers = m.copyTimelineSelection(source.timeline, {
      kind: "layers",
      layers: [0],
      frames: [0],
    });
    const appended = m.pasteTimelineClipboard(before, layers);
    assert.equal(appended.layers[1].tilesetId, 1);
    assert.equal(appended.tilesets[1].pixels[8], 255);
    const project = m.projectFromClipboardImage(copy);
    assert.equal(project.timeline.layers[0].kind, "tilemap");
    const palette = [
        [0, 0, 0, 0],
        [255, 0, 0, 255],
        [0, 0, 255, 255],
      ],
      indexedDoc = {
        ...target,
        palette,
        timeline: {
          ...target.timeline,
          colorDepth: 8,
          transparentIndex: 0,
          frames: target.timeline.frames.map((f) => ({ ...f, palette })),
        },
      };
    const indexed = m.prepareImageClipboardForDocument(copy, indexedDoc);
    assert.deepEqual([...indexed.tilemap.tileset.asepritePixels], [0, 0, 1, 1]);
    const asepriteTileset = { ...set(255, 0), asepritePixels: Uint8Array.of(0, 0, 2, 2) },
      asepriteDoc = doc(asepriteTileset);
    asepriteDoc.palette = [
      [0, 0, 0, 0],
      [255, 0, 0, 255],
      [255, 0, 0, 255],
    ];
    asepriteDoc.timeline.colorDepth = 8;
    asepriteDoc.timeline.transparentIndex = 0;
    asepriteDoc.timeline.frames[0].palette = asepriteDoc.palette;
    const sourceCopy = m.copyDocumentSelection(asepriteDoc, false, true),
      same = m.prepareImageClipboardForDocument(sourceCopy, asepriteDoc);
    assert.deepEqual(
      [...same.tilemap.tileset.asepritePixels],
      [0, 0, 2, 2],
      "duplicate palette indices survive same-palette paste",
    );
    const rgb = m.prepareImageClipboardForDocument(sourceCopy, target);
    assert.equal(rgb.tilemap.tileset.asepritePixels, undefined);
    assert.equal(rgb.tilemap.tileset.pixels[8], 255);
    const gray = m.prepareImageClipboardForDocument(copy, {
      ...target,
      timeline: { ...target.timeline, colorDepth: 16 },
    });
    assert.equal(gray.tilemap.tileset.asepritePixels.length, 8);
    const remapped = m.prepareImageClipboardForDocument(sourceCopy, indexedDoc);
    assert.deepEqual([...remapped.tilemap.tileset.asepritePixels], [0, 0, 1, 1]);
    const animated = m.copyTimelineSelection(asepriteDoc.timeline, {
      kind: "layers",
      layers: [0],
      frames: [0],
    });
    const convertedRange = m.prepareTimelineClipboardForDocument(animated, indexedDoc);
    assert.deepEqual([...convertedRange.tilesets[0].asepritePixels], [0, 0, 1, 1]);
    const bluePalette = [
      [0, 0, 0, 0],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
    ];
    animated.frames.push({ ...animated.frames[0], palette: bluePalette });
    assert.throws(
      () => m.prepareTimelineClipboardForDocument(animated, target),
      /different frame palettes/,
    );

    const converted = m.prepareImageClipboardForDocument(
      { ...copy, sourceProfile: { type: "srgb", gamma: 1 } },
      target,
    );
    assert.equal(converted.tilemap.tileset.pixels.length, 16);
    console.log(
      "Tilemap clipboard: whole-cell selection, owned snapshots, collision remapping, content reuse, layer/cel ranges, new sprite, profile and mode safeguards passed",
    );
  }, 60_000);
});
