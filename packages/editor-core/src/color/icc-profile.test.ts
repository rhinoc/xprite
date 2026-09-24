import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("color-profile-display", () => {
  it("preserves default sRGB values and alpha when converting display RGB", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/color/icc-profile.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { colorProfileToSrgb } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const value = [128, 128, 64, 128];
    const defaultSrgb = colorProfileToSrgb(value, undefined);
    const explicitSrgb = colorProfileToSrgb(value, { type: "srgb" });
    const gammaDisplay = colorProfileToSrgb(value, { type: "srgb", gamma: 1 });

    assert.deepEqual(defaultSrgb, value);
    assert.deepEqual(explicitSrgb, value);
    assert.notDeepEqual(gammaDisplay.slice(0, 3), value.slice(0, 3));
    assert.equal(gammaDisplay[3], value[3]);
  });
});
