import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("editor-color", () => {
  it("editor-color behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/color/color.ts"],
      bundle: true,
      format: "esm",
      platform: "node",
      write: false,
    });
    const {
      hexToRgba,
      rgbaToHex,
      rgbaToHsva,
      hsvaToRgba,
      colorChannelValue,
      setColorChannel,
      setHsvaChannel,
    } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    assert.deepEqual(hexToRgba("#FE81207F"), [254, 129, 32, 127]);
    assert.equal(rgbaToHex([254, 129, 32, 127]), "#FE81207F");
    assert.equal(rgbaToHex([254, 129, 32, 255]), "#FE8120");
    assert.throws(() => hexToRgba("#BAD"));
    assert.throws(() => hexToRgba("zzzzzz"));
    assert.deepEqual(rgbaToHsva([255, 0, 0, 128]), [0, 1, 1, 128]);
    assert.deepEqual(rgbaToHsva([0, 255, 0, 255]), [120, 1, 1, 255]);
    assert.deepEqual(rgbaToHsva([0, 0, 255, 0]), [240, 1, 1, 0]);
    assert.deepEqual(hsvaToRgba([360, 1, 1, 255]), [255, 0, 0, 255]);
    assert.deepEqual(hsvaToRgba([-120, 1, 1, 255]), [0, 0, 255, 255]);
    let checks = 0;
    for (let r = 0; r <= 255; r += 17)
      for (let g = 0; g <= 255; g += 17)
        for (let b = 0; b <= 255; b += 17) {
          const c = [r, g, b, 177];
          assert.deepEqual(hsvaToRgba(rgbaToHsva(c)), c);
          checks++;
        }
    assert.deepEqual(setColorChannel([255, 0, 0, 127], "g", 300), [255, 255, 0, 127]);
    assert.deepEqual(setColorChannel([255, 0, 0, 127], "h", 120), [0, 255, 0, 127]);
    assert.equal(colorChannelValue([128, 128, 128, 255], "h", 271), 271);
    let draft = [0, 0, 0, 255];
    draft = setHsvaChannel(draft, "h", 240);
    draft = setHsvaChannel(draft, "s", 100);
    assert.deepEqual(hsvaToRgba(draft), [0, 0, 0, 255]);
    draft = setHsvaChannel(draft, "v", 100);
    assert.deepEqual(hsvaToRgba(draft), [0, 0, 255, 255], "HSV choices persist while black");
    console.log(
      `Color core passed ${checks} exact RGB/HSV roundtrips, primary/wrapped hues, alpha/hex validation, channel bounds, and achromatic HSV editing.`,
    );
  }, 60_000);
});
