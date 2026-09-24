import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("sprite-dimensions", () => {
  it("sprite-dimensions behavior", async () => {
    const result = await build({
      entryPoints: ["packages/editor-core/src/sprite/dimensions.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
    });
    const { parseSpriteDimension } = await import(
      `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
    );
    for (const [text, expected] of [
      ["64", 64],
      [" 128 ", 128],
      ["0", 1],
      ["-4", 1],
      ["5000", 5000],
      ["65535", 32768],
      ["+17", 17],
      ["", null],
      ["1.5", null],
      ["64*2", null],
      ["10px", null],
      ["Infinity", null],
      ["9007199254740992", null],
    ])
      assert.equal(parseSpriteDimension(text), expected, text);
    assert.equal(parseSpriteDimension("128", 64), 64);
    assert.equal(parseSpriteDimension("64", 0), null);
    console.log(
      "New Sprite integer-entry validation, source minimum clamping and browser dimension limits pass (15 cases).",
    );
  }, 60_000);
});
