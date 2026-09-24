import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("tilemap-transfer-v2", () => {
  it("tilemap-transfer-v2 behavior", async () => {
    const { outputFiles } = await build({
      stdin: {
        contents: `export * from './packages/editor-core/src/timeline/operations/timeline-range.ts';export * from './packages/editor-core/src/tilemap/model.ts';`,
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
    const palette = [
      [0, 0, 0, 0],
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [0, 255, 0, 255],
    ];
    const layer = (id, kind = "tilemap") => ({
      id: `layer-${id}`,
      name: `Layer ${id}`,
      kind,
      tilesetId: kind === "tilemap" ? id : undefined,
      visible: true,
      locked: false,
      opacity: 255,
      flags: 3,
    });
    const set = (id, w = 2) => ({
      id,
      name: `Set ${id}`,
      tileWidth: w,
      tileHeight: 1,
      tileCount: 2,
      flags: 6,
      baseIndex: 1,
      pixels: Uint8Array.from([
        ...Array.from({ length: w * 4 }, () => 0),
        ...Array.from({ length: w }, (_, i) => (i ? [0, 255, 0, 255] : [255, 0, 0, 255])).flat(),
      ]),
    });
    const range = { kind: "cels", frames: [0, 1], layers: [0] };
    function fixture(depth = 32, destWidth = 2) {
      const a = set(0),
        b = set(1, destWidth);
      b.pixels.fill(0);
      if (depth === 8) {
        a.asepritePixels = Uint8Array.of(0, 0, 2, 3);
        b.asepritePixels = new Uint8Array(destWidth * 2);
      }
      if (depth === 16) {
        a.asepritePixels = Uint8Array.of(0, 0, 0, 0, 60, 255, 90, 100);
        b.asepritePixels = new Uint8Array(destWidth * 4);
      }
      const map = { width: 2, height: 1, tiles: Uint32Array.of((1 | m.TILE_X_FLIP) >>> 0, 0) },
        cel = {
          tilemap: map,
          pixels: m.rasterizeTilemap(map, a, depth, palette),
          x: -3,
          y: 2,
          opacity: 173,
          zIndex: 2,
        };
      return {
        colorDepth: depth,
        transparentIndex: 0,
        layers: [layer(0), layer(1), layer(2, "image")],
        tilesets: [a, b],
        frames: [
          { duration: 100, palette, cels: [cel, null, null] },
          { duration: 200, palette, cels: [{ ...cel, x: 1 }, null, null] },
        ],
        activeFrame: 0,
        activeLayer: 0,
      };
    }
    for (const depth of [32, 8, 16])
      for (const copy of [true, false]) {
        const t = fixture(depth),
          original = t.tilesets[1].pixels.slice(),
          next = m.transferTimelineRange(t, range, 0, 1, copy),
          a = next.frames[0].cels[1],
          b = next.frames[1].cels[1];
        m.assertTilemapTimeline(next);
        assert.equal(next.layers[1].kind, "tilemap");
        assert.equal(a.tilemap, b.tilemap);
        assert.notEqual(a.tilemap, t.frames[0].cels[0].tilemap);
        assert.equal(a.tilemap.tiles[0] & m.TILE_X_FLIP, m.TILE_X_FLIP | 0);
        assert.equal(a.x, -3);
        assert.equal(b.x, 1);
        assert.equal(a.opacity, 173);
        assert.equal(a.zIndex, 2);
        assert.deepEqual(next.tilesets[0], t.tilesets[0]);
        assert.deepEqual(t.tilesets[1].pixels, original);
        assert.equal(
          next.frames[0].cels[0]?.tilemap ?? null,
          copy ? t.frames[0].cels[0].tilemap : null,
        );
        assert.deepEqual(a.pixels.data, t.frames[0].cels[0].pixels.data);
        if (depth !== 32)
          assert.deepEqual(
            next.tilesets[1].asepritePixels.slice(-t.tilesets[0].asepritePixels.length / 2),
            t.tilesets[0].asepritePixels.slice(t.tilesets[0].asepritePixels.length / 2),
          );
        const again = m.transferTimelineRange(next, { ...range, layers: [1] }, 0, -1, true);
        assert.equal(again.tilesets[0].tileCount, 2, "content deduplicates");
      }
    for (const depth of [32, 8, 16]) {
      const t = fixture(depth, 1),
        next = m.transferTimelineRange(t, range, 0, 1, true),
        cel = next.frames[0].cels[1];
      m.assertTilemapTimeline(next);
      assert.equal(cel.tilemap.width, 4);
      assert.equal(cel.x, -3);
      assert.deepEqual(cel.pixels.data, t.frames[0].cels[0].pixels.data);
      assert.equal(cel.tilemap, next.frames[1].cels[1].tilemap);
      const raster = m.transferTimelineRange(t, range, 0, 2, true);
      m.assertTilemapTimeline(raster);
      assert.equal(raster.frames[0].cels[2].tilemap, undefined);
      assert.deepEqual(
        raster.frames[0].cels[2].pixels.data,
        t.frames[0].cels[0].pixels.data.slice(0, 8),
      );
      if (depth === 8) assert.deepEqual([...raster.frames[0].cels[2].asepriteSamples.data], [3, 2]);
      const back = m.transferTimelineRange(
        { ...raster, gridBounds: { x: 0, y: 0, width: 2, height: 1 } },
        { ...range, layers: [2] },
        0,
        -1,
        true,
      );
      m.assertTilemapTimeline(back);
      assert.equal(back.frames[0].cels[1].x, -3);
      assert.deepEqual(back.frames[0].cels[1].pixels.data, raster.frames[0].cels[2].pixels.data);
    }
    // Overlap takes each source from the original graph and preserves unrelated links.
    const overlap = fixture();
    overlap.layers[2] = layer(2);
    overlap.tilesets.push(set(2));
    overlap.frames[0].cels[1] = { ...overlap.frames[0].cels[0] };
    const moved = m.transferTimelineRange(
      overlap,
      { kind: "cels", layers: [0, 1], frames: [0] },
      0,
      1,
      false,
    );
    m.assertTilemapTimeline(moved);
    assert.equal(moved.frames[0].cels[0], null);
    assert.ok(moved.frames[0].cels[1].tilemap);
    assert.ok(moved.frames[0].cels[2].tilemap);
    assert.ok(overlap.frames[0].cels[0]);
    // Appended frames and palette changes retain raw indexed samples.
    const animated = fixture(8);
    animated.frames[1].palette = [
      [0, 0, 0, 0],
      [255, 0, 0, 255],
      [0, 0, 255, 255],
      [255, 255, 0, 255],
    ];
    const shifted = m.transferTimelineRange(animated, range, 1, 1, true);
    assert.equal(shifted.frames.length, 3);
    assert.equal(shifted.frames[1].cels[1].tilemap, shifted.frames[2].cels[1].tilemap);
    assert.deepEqual(Array.from(shifted.tilesets[1].asepritePixels.slice(-2)), [2, 3]);
    const rasterAnimated = m.transferTimelineRange(animated, range, 0, 2, true);
    assert.equal(
      rasterAnimated.frames[0].cels[2].asepriteSamples,
      rasterAnimated.frames[1].cels[2].asepriteSamples,
    );
    assert.notDeepEqual(
      rasterAnimated.frames[0].cels[2].pixels.data,
      rasterAnimated.frames[1].cels[2].pixels.data,
      "linked Aseprite image projection uses destination frame palette",
    );
    // Image source uses sprite grid origin, including partial tiles at negative x.
    const imageSource = fixture(8);
    imageSource.layers[0] = layer(0, "image");
    for (const frame of imageSource.frames) {
      const old = frame.cels[0];
      frame.cels[0] = {
        ...old,
        tilemap: undefined,
        asepriteSamples: { depth: 8, width: 4, height: 1, data: Uint8Array.of(3, 2, 0, 0) },
      };
    }
    imageSource.gridBounds = { x: 0, y: 0, width: 2, height: 1 };
    const tiled = m.transferTimelineRange(imageSource, range, 0, 1, true);
    assert.equal(tiled.frames[0].cels[1].x, -4);
    assert.equal(tiled.frames[0].cels[1].tilemap.width, 3);
    assert.deepEqual(
      [...m.rasterizeTilemapSamples(tiled.frames[0].cels[1].tilemap, tiled.tilesets[1], 8).data],
      [0, 3, 2, 0, 0, 0],
    );
    const invalid = {
      ...animated,
      layers: [animated.layers[0], { ...animated.layers[1], tilesetId: 999 }, animated.layers[2]],
    };
    assert.equal(m.transferTimelineRange(invalid, range, 0, 1, false), invalid);
    console.log(
      "Tilemap transfer v2: cross-set moves/copies, overlapping ranges, flags, links, Aseprite samples, retiling, raster conversion, immutable source, and appended frames passed.",
    );
  }, 60_000);
});
