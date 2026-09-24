import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("tilemap-selection-transform", () => {
  it("tilemap-selection-transform behavior", async () => {
    const bundle = await build({
      stdin: {
        contents:
          'export * from "./packages/editor-core/src/tilemap/operations/tile-selection-transform.ts"; export * from "./packages/editor-core/src/tilemap/model.ts";',
        resolveDir: process.cwd(),
      },
      bundle: true,
      format: "esm",
      platform: "node",
      write: false,
    });
    const editor = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
    );

    function source(width, height, words, tileWidth = 2, tileHeight = 3) {
      const count = 64;
      const tileset = {
        id: 1,
        name: "fixture",
        flags: 6,
        baseIndex: 1,
        tileWidth,
        tileHeight,
        tileCount: count,
        pixels: new Uint8Array(count * tileWidth * tileHeight * 4),
      };
      for (let tile = 1; tile < count; tile++) {
        for (let pixel = 0; pixel < tileWidth * tileHeight; pixel++)
          tileset.pixels.set([tile, 0, 0, 255], (tile * tileWidth * tileHeight + pixel) * 4);
      }
      const map = { width, height, tiles: Uint32Array.from(words) };
      return {
        pixels: editor.rasterizeTilemap(map, tileset),
        mask: {
          x: -2,
          y: 6,
          width: width * tileWidth,
          height: height * tileHeight,
          data: new Uint8Array(width * tileWidth * height * tileHeight).fill(255),
        },
        tilemap: { map, selected: new Uint8Array(width * height).fill(255), tileset },
      };
    }
    const resize = (image, width, height, flip, originalMask) =>
      editor.transformTilemapSelection(
        image,
        {
          bounds: { x: -2, y: 6, width: width * 2, height: height * 3 },
          angle: 0,
        },
        flip,
        originalMask,
      );
    const words = (result) => [...result.image.tilemap.map.tiles];

    // A repeating grid preserves the four corners while extending its interior.
    const grid = source(3, 3, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const gridBefore = structuredClone(grid);
    const larger = resize(grid, 5, 4);
    assert.deepEqual(words(larger), [1, 2, 2, 2, 3, 4, 5, 5, 5, 6, 4, 5, 5, 5, 6, 7, 8, 8, 8, 9]);
    assert.deepEqual(grid, gridBefore, "source tiles, mask, and tileset stay immutable");
    assert.deepEqual(larger.bounds, { x: -2, y: 6, width: 10, height: 12 });

    // A missing right border must not erase an interior tile that reached that cell.
    const edge = source(4, 1, [0, 0x60000002, 0x40000003, 0]);
    const flipped = resize(edge, 3, 1, "horizontal");
    assert.deepEqual(words(flipped), [0, 0x40000003, 0x60000002]);
    assert.deepEqual([...flipped.image.tilemap.selected], [0, 255, 255]);
    assert.deepEqual(words(resize(source(1, 4, [0, 22, 33, 44]), 1, 3, "vertical")), [44, 33, 22]);

    const signedGrid = source(2, 2, [1, 0x60000002, 0x40000003, 4]);
    const signed = editor.transformTilemapSelection(signedGrid, {
      bounds: { x: 2, y: 12, width: -4, height: -6 },
      angle: 0,
    });
    assert.deepEqual(signed.bounds, { x: -2, y: 6, width: 4, height: 6 });
    assert.deepEqual(words(signed), [1, 0x60000002, 0x40000003, 4]);
    assert.deepEqual(
      words(
        editor.transformTilemapSelection(
          signedGrid,
          { bounds: { x: 2, y: 6, width: -4, height: 6 }, angle: 0 },
          "horizontal",
        ),
      ),
      [0x60000002, 1, 4, 0x40000003],
      "native signed resize keeps tile order; an explicit flip reverses words without changing flags",
    );
    const collapsed = editor.transformTilemapSelection(signedGrid, {
      bounds: { x: -2, y: 6, width: 0, height: 6 },
      angle: 0,
    });
    assert.ok(words(collapsed).every((word) => word === 0));
    assert.ok(collapsed.image.mask.data.every((value) => value === 0));

    // Empty source cells remain empty; the pixel mask has its own scaling path.
    const sparse = source(3, 1, [1, 0, 3]);
    sparse.mask.data.fill(0);
    for (let y = 0; y < 3; y++) {
      sparse.mask.data.fill(255, y * 6, y * 6 + 2);
      sparse.mask.data.fill(255, y * 6 + 4, y * 6 + 6);
    }
    const spread = resize(sparse, 5, 1);
    assert.deepEqual(words(spread), [1, 0, 0, 0, 3]);
    assert.deepEqual([...spread.image.tilemap.selected], [255, 0, 0, 0, 255]);
    assert.deepEqual(
      Array.from(spread.image.mask.data.slice(0, 10)),
      [255, 255, 255, 0, 0, 0, 0, 255, 255, 255],
    );

    const originalMask = {
      x: -1,
      y: 7,
      width: 5,
      height: 2,
      data: Uint8Array.from([255, 0, 255, 0, 255, 0, 255, 0, 255, 0]),
    };
    const partial = editor.transformTilemapSelection(
      sparse,
      {
        bounds: { x: -1, y: 7, width: 9, height: 2 },
        angle: 0,
      },
      undefined,
      originalMask,
    );
    assert.deepEqual(partial.origin, { x: -2, y: 6 });
    assert.equal(partial.image.mask.width, 10);
    assert.equal(partial.image.mask.height, 3);
    assert.ok(partial.image.mask.data.some(Boolean));
    assert.ok(partial.image.mask.data.some((value) => value === 0));

    assert.throws(() => resize(sparse, 1e6, 1e6));
    assert.throws(
      () =>
        editor.transformTilemapSelection(sparse, {
          bounds: sparse.mask,
          angle: Math.PI / 2,
        }),
      /does not support/,
    );
    assert.deepEqual(
      editor.transformTilemapSelection(sparse, {
        bounds: { x: -3, y: 5, width: 5, height: 4 },
        angle: 0,
      }).bounds,
      { x: -4, y: 3, width: 6, height: 6 },
    );

    console.log(
      "Tile selection transform: repeating grid, flags, empty borders, sparse and partial masks, immutability, bounds and guards pass.",
    );
  }, 60_000);
});
