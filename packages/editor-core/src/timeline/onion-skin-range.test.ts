import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("onion-skin-range [feature-7-12]", () => {
  it("onion-skin-range behavior", async () => {
    const { outputFiles } = await build({
      stdin: {
        contents: `export * from './packages/editor-core/src/timeline/onion-skin-range.ts';export {defaultOnionSkinSettings} from './packages/editor-core/src/timeline/animation-options.ts';`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const api = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const value = {
      ...api.defaultOnionSkinSettings,
      active: true,
      previousFrames: 4,
      nextFrames: 3,
    };
    assert.equal(api.onionSkinRangeGeometry({ ...value, active: false }, 2, 8, 24), null);
    assert.deepEqual(api.onionSkinRangeGeometry(value, 2, 8, 24), {
      first: 0,
      last: 5,
      x: 0,
      width: 144,
      handleWidth: 6,
    });
    assert.deepEqual(api.onionSkinRangeGeometry(value, 6, 8, 24, 48), {
      first: 2,
      last: 7,
      x: 0,
      width: 144,
      handleWidth: 6,
    });
    assert.deepEqual(api.onionSkinRangeGeometry(value, 0, 1, 24), {
      first: 0,
      last: 0,
      x: 0,
      width: 24,
      handleWidth: 6,
    });
    const left = api.dragOnionSkinRange(value, "previous", 0, 1);
    assert.equal(
      left.previousFrames,
      3,
      "drag retains invisible original extent rather than snapping to painted clipped edge",
    );
    assert.equal(left.nextFrames, 3);
    assert.equal(
      api.dragOnionSkinRange(value, "previous", 2, 20).previousFrames,
      0,
      "cannot create negative count",
    );
    assert.equal(api.dragOnionSkinRange(value, "next", 5, 9).nextFrames, 7);
    assert.equal(api.dragOnionSkinRange(value, "next", 5, -4).nextFrames, 0);
    assert.equal(value.previousFrames, 4, "drag does not mutate source preferences");
    console.log(
      "Onion range handles: source first/last clipping, 6-scene-pixel hits, scroll offset, original-count frame deltas, zero clamp and source immutability pass.",
    );
  }, 60_000);
});
