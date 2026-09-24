import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("file-names", () => {
  it("file-names behavior", async () => {
    const { outputFiles } = await build({
      entryPoints: ["packages/editor-core/src/import-export/file-names.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const { pngFileName } = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    for (const [input, want] of [
      ["photo.jpg", "photo.png"],
      ["PHOTO.JPEG", "PHOTO.png"],
      ["icon.webp", "icon.png"],
      ["sprite.aseprite", "sprite.png"],
      ["name.v2", "name.v2.png"],
      [" original.PNG ", "original.PNG"],
      ["", "untitled.png"],
      [".jpg", "untitled.png"],
    ])
      assert.equal(pngFileName(input), want);
    console.log(
      "PNG filename conversion: known image formats, dotted names, case and empty names pass.",
    );
  }, 60_000);
});
