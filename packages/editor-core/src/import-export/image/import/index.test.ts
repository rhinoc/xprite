import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("image-import", () => {
  it("image-import behavior", async () => {
    const bundle = await build({
      entryPoints: ["packages/editor-core/src/import-export/image/import/index.ts"],
      bundle: true,
      format: "esm",
      platform: "node",
      write: false,
      sourcemap: false,
    });
    const source = bundle.outputFiles[0].text;
    const core = await import(
      `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    );
    const { analyzePixelArt, countDistinctColors, extractPalette, pixelateImage } = core;

    let checks = 0;
    function check(condition, message) {
      assert.ok(condition, message);
      checks += 1;
    }
    function equal(actual, expected, message) {
      assert.deepEqual(actual, expected, message);
      checks += 1;
    }
    function fixture(width, height, colorAt) {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          const color = colorAt(x, y);
          data.set(color, offset);
        }
      }
      return { width, height, data };
    }

    const colors = {
      black: [0, 0, 0, 255],
      white: [255, 255, 255, 255],
      red: [255, 32, 32, 255],
      transparent: [255, 0, 0, 0],
    };
    const pixelGrid = fixture(16, 16, (x, y) =>
      x < 8 ? (y < 8 ? colors.black : colors.red) : y < 8 ? colors.white : colors.black,
    );
    const checker = fixture(8, 8, (x, y) => ((x + y) % 2 ? colors.white : colors.black));
    const photoish = fixture(96, 96, (x, y) => {
      const noise = (x * 17 + y * 31 + x * y * 7) % 37;
      return [(x * 255) / 95 + noise, (y * 255) / 95 + noise, ((x + y) * 127) / 95 + noise, 255];
    });
    const alpha = fixture(2, 2, (x, y) =>
      x === 0 && y === 0 ? colors.transparent : [0, 96, 255, 255],
    );

    const pixelAnalysis = analyzePixelArt(pixelGrid);
    check(
      pixelAnalysis.classification === "likely-pixel-art",
      "pixel grid should be recognized as likely pixel art",
    );
    check(
      pixelAnalysis.isHeuristic === true && pixelAnalysis.evidence.length > 0,
      "analysis exposes heuristic evidence",
    );
    const overridden = analyzePixelArt(pixelGrid, { userOverride: "likely-photo" });
    equal(overridden.classification, "likely-photo", "user override is retained");
    equal(
      overridden.suggestedClassification,
      pixelAnalysis.suggestedClassification,
      "override does not rewrite the suggestion",
    );
    check(overridden.overrideApplied && overridden.confidence === 1, "override is explicit");
    const photoAnalysis = analyzePixelArt(photoish);
    check(
      photoAnalysis.classification === "likely-photo",
      "gradient/noise fixture should be recognized as likely photo",
    );

    const nearest = pixelateImage(checker, { method: "nearest", targetWidth: 4, targetHeight: 4 });
    equal([nearest.width, nearest.height], [4, 4], "nearest dimensions");
    equal(
      Array.from(nearest.data.slice(0, 4)),
      colors.black,
      "nearest uses Aseprite floor mapping",
    );
    const preserved = pixelateImage(pixelGrid, { blockSize: 4, preserveDimensions: true });
    equal(
      [preserved.width, preserved.height],
      [16, 16],
      "preserveDimensions restores source dimensions",
    );
    equal(
      Array.from(preserved.data.slice(0, 4)),
      colors.black,
      "nearest upsample keeps the first block",
    );
    const box = pixelateImage(checker, { method: "box", targetWidth: 1, targetHeight: 1 });
    equal([...box.data], [128, 128, 128, 255], "box mode averages checker pixels");
    const alphaBox = pixelateImage(alpha, {
      method: "box",
      targetWidth: 1,
      targetHeight: 1,
      alphaMode: "premultiplied",
    });
    equal(
      [...alphaBox.data],
      [0, 96, 255, 191],
      "premultiplied box mode preserves opaque color and alpha coverage",
    );

    const original = new Uint8ClampedArray(pixelGrid.data);
    pixelateImage(pixelGrid, { targetSize: { width: 5, height: 5 }, maxColors: 2 });
    equal([...pixelGrid.data], [...original], "pixelation does not mutate its input");
    equal(countDistinctColors(pixelGrid), 3, "distinct color count");
    const palette = extractPalette(pixelGrid, { maxColors: 2 });
    equal(palette.length, 2, "palette reduction limit");
    equal(palette[0].count, 128, "palette counts are deterministic");
    const reduced = pixelateImage(pixelGrid, { maxColors: 2 });
    check(countDistinctColors(reduced) <= 2, "maxColors bounds output colors");

    for (const bad of [
      () => pixelateImage({ width: 0, height: 1, data: new Uint8ClampedArray() }),
      () => pixelateImage({ width: 1, height: 1, data: new Uint8ClampedArray(3) }),
      () => pixelateImage(pixelGrid, { targetWidth: 0 }),
    ]) {
      assert.throws(bad, /must|integer|bytes/i);
      checks += 1;
    }

    const largeWidth = 3840;
    const largeHeight = 2160;
    const large = fixture(largeWidth, largeHeight, (x, y) => [
      x & 255,
      y & 255,
      (x * 13 + y * 7) & 255,
      255,
    ]);
    const started = performance.now();
    const preview = pixelateImage(large, {
      blockSize: 32,
      preserveDimensions: true,
      maxColors: 32,
    });
    const elapsed = performance.now() - started;
    equal([preview.width, preview.height], [largeWidth, largeHeight], "4K preview dimensions");
    check(preview.data.length === large.data.length, "4K preview byte length");
    console.log(
      `${checks} image-import fixtures passed; 4K preview benchmark ${elapsed.toFixed(1)}ms. Heuristics remain suggestions and should be user-overridable.`,
    );
  }, 60_000);
});
