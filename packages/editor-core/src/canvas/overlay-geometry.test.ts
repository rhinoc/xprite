import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("editor-overlays", () => {
  it("editor-overlays behavior", async () => {
    const bundle = await build({
      entryPoints: ["packages/editor-core/src/canvas/overlay-geometry.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
    });
    const {
      libreSpriteGridGeometry: grid,
      libreSpritePixelGridGeometry: pixelGrid,
      documentLayerEdgeGeometry: edges,
      documentAutoGuideGeometry: guideGeometry,
      documentGuideDashVisible: dash,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
    );
    const doc = { width: 32, height: 32 },
      origin = { x: 119, y: -12 },
      cell = { width: 16, height: 16 };
    let value = grid(doc, origin, 1, cell);
    assert.equal(value.alpha, 80);
    assert.deepEqual(value.lines, [
      { x: 119, y: -12, width: 32, height: 1 },
      { x: 119, y: 4, width: 32, height: 1 },
      { x: 119, y: 20, width: 32, height: 1 },
      { x: 119, y: -12, width: 1, height: 32 },
      { x: 135, y: -12, width: 1, height: 32 },
      { x: 151, y: -12, width: 1, height: 32 },
    ]);
    assert.equal(grid(doc, origin, 0.5, cell).alpha, 40);
    assert.equal(grid(doc, origin, 2, cell).alpha, 160);
    assert.equal(grid(doc, origin, 4, cell).alpha, 255);
    assert.deepEqual(grid(doc, origin, 0.125, cell).lines, []);
    assert.equal(grid(doc, origin, 1, { width: 16, height: 8 }).alpha, 60);
    value = grid(doc, { x: -3, y: -3 }, 1 / 3, { width: 16, height: 16 });
    assert.deepEqual(
      value.lines.filter((v) => v.height === 1).map((v) => v.y),
      [-3, 2],
    );
    assert.equal(value.alpha, 25);
    const viewport = { x: 0, y: 0, width: 100, height: 100 };
    value = pixelGrid({ x: 0, y: 0, width: 32, height: 32 }, origin, 2, viewport);
    assert.equal(value.alpha, 0);
    assert.deepEqual(value.lines, []);
    value = pixelGrid({ x: 0, y: 0, width: 32, height: 32 }, { x: 10, y: 10 }, 4, viewport);
    assert.equal(value.alpha, 22);
    assert.deepEqual(value.lines.slice(0, 3), [
      { x: 10, y: 10, width: 128, height: 1 },
      { x: 10, y: 14, width: 128, height: 1 },
      { x: 10, y: 18, width: 128, height: 1 },
    ]);
    value = pixelGrid({ x: -16, y: -16, width: 32, height: 32 }, { x: 0, y: 0 }, 16, viewport);
    assert.equal(value.alpha, 160);
    assert(
      value.lines.some((line) => line.x === 0),
      "Pixel grid aligns to sprite-coordinate multiples for negative tiled regions",
    );
    assert.deepEqual(edges({ x: 2, y: 3, width: 4, height: 5 }, { x: 10, y: 20 }, 1), [
      { x: 12, y: 23, width: 4, height: 1 },
      { x: 12, y: 27, width: 4, height: 1 },
      { x: 12, y: 24, width: 1, height: 3 },
      { x: 15, y: 24, width: 1, height: 3 },
    ]);
    assert.deepEqual(edges({ x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0 }, 1), [
      { x: 0, y: 0, width: 1, height: 1 },
    ]);
    assert.deepEqual(edges({ x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0 }, 0.5), []);
    assert.deepEqual(edges({ x: -3, y: -3, width: 6, height: 6 }, { x: 10, y: 20 }, 0.5), [
      { x: 9, y: 19, width: 2, height: 1 },
      { x: 9, y: 20, width: 2, height: 1 },
    ]);
    console.log(
      "Source grid and pixel-grid opacity/threshold/placement, plus layer-edge inclusive bounds checks pass. Aseprite image comparisons remain separate.",
    );

    const h = guideGeometry(
      { axis: "horizontal", from: 0, to: 5, position: 4, distance: 5 },
      { x: 10, y: 20 },
      1,
      { width: 32, height: 32 },
    );
    assert.deepEqual(h, {
      line: { x: 10, y: 24, width: 5, height: 1 },
      extension: undefined,
      midpoint: 12,
      position: 24,
    });
    const v = guideGeometry(
      {
        axis: "vertical",
        from: 0,
        to: 9,
        position: 32,
        distance: 9,
        extension: { from: { x: 32, y: 32 }, to: { x: 40, y: 32 } },
      },
      { x: 10, y: 20 },
      1,
      { width: 32, height: 32 },
    );
    assert.deepEqual(v.line, { x: 42, y: 20, width: 1, height: 9 });
    assert.deepEqual(v.extension, { x: 42, y: 51, width: 8, height: 1 });
    assert.deepEqual(
      Array.from({ length: 16 }, (_, x) => Number(dash(x, 0))),
      [1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
    );
    assert.equal(dash(3, 5), dash(8, 0));
    console.log(
      "Auto-guide 1GUI-pixel rectangles, endpoint length, inset dotted edge and source8Pixel diagonal dash phase pass.",
    );
  }, 60_000);
});
