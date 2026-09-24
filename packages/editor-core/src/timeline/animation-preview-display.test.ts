import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("animation-preview-display [feature-7-12]", () => {
  it("animation-preview-display behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/timeline/animation-preview-display.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { renderAnimationPreview } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const pixels = { width: 32, height: 16, data: new Uint8ClampedArray(32 * 16 * 4) };
    pixels.data.set([255, 0, 0, 255]);
    const t = {
      layers: [{ id: "one", name: "Layer", flags: 3, visible: true, locked: false, opacity: 255 }],
      frames: [{ duration: 100, cels: [{ pixels, x: 0, y: 0, opacity: 255, zIndex: 0 }] }],
      activeFrame: 0,
      activeLayer: 0,
    };
    const before = pixels.data.slice(),
      face = [97, 84, 97, 255],
      render = renderAnimationPreview(
        t,
        0,
        { width: 32, height: 16 },
        { width: 100, height: 60 },
        1,
        { x: 0, y: 0 },
        face,
      );
    const pixel = (image, x, y) =>
      Array.from(image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));
    assert.deepEqual(
      pixel(render, 0, 0),
      face,
      "outside sprite uses editor face, not infinite checkers",
    );
    assert.deepEqual(
      pixel(render, 18, 14),
      [255, 0, 0, 255],
      "100 percent expands document pixel to two scene pixels",
    );
    assert.deepEqual(pixel(render, 19, 15), [255, 0, 0, 255]);
    assert.deepEqual(pixel(render, 20, 14), [128, 128, 128, 255]);
    assert.deepEqual(
      pixel(render, 50, 14),
      [192, 192, 192, 255],
      "checker cells are sixteen document pixels",
    );
    assert.deepEqual(
      pixel(render, 16, 14),
      [0, 0, 0, 255],
      "source document outline is one GUI pixel",
    );
    const panned = renderAnimationPreview(
      t,
      0,
      { width: 32, height: 16 },
      { width: 100, height: 60 },
      1,
      { x: 4, y: 3 },
      face,
    );
    assert.deepEqual(pixel(panned, 26, 20), [255, 0, 0, 255]);
    assert.deepEqual(
      pixels.data,
      before,
      "display conversion and checker composition never write model pixels",
    );
    console.log(
      "Preview display: source viewport scale, bounded scene checker, face outside, document edge, independent pan and immutable RGBA pass.",
    );
  }, 60_000);
});
