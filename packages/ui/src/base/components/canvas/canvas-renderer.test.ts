import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it, vi } from "vitest";

/** The existing sampler is the oracle: compositing after sampling must equal
 * sampling a precomposited opaque raster at every scale and grid phase. */
describe("direct RGBA presentation", () => {
  it("preserves checker phase, alpha rounding, offsets and fractional pixel centers", async () => {
    const bundle = await build({
      entryPoints: ["packages/ui/src/base/components/canvas/canvas-renderer.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
    });
    const { CanvasRenderer } = await import(
      `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
    );
    vi.stubGlobal(
      "ImageData",
      class {
        readonly data: Uint8ClampedArray;
        constructor(
          readonly width: number,
          readonly height: number,
        ) {
          this.data = new Uint8ClampedArray(width * height * 4);
        }
      },
    );
    try {
      const width = 17,
        height = 11;
      for (const offset of [0, 1, 4]) {
        const data = new Uint8ClampedArray(new ArrayBuffer(width * height * 4 + offset), offset);
        for (let at = 0; at < data.length; at += 4)
          data.set(
            [at % 256, (at * 7) % 256, (at * 13) % 256, [0, 1, 127, 128, 254, 255][(at / 4) % 6]],
            at,
          );
        const before = data.slice();
        const source = { width, height, data };
        for (const origin of [
          { x: 0, y: 0 },
          { x: 3, y: 5 },
        ]) {
          for (const cellSize of [1, 3]) {
            const checker = { cellSize, light: [192, 192, 192], dark: [128, 128, 128] };
            const opaque = new Uint8ClampedArray(data.length);
            for (let y = 0; y < height; y++)
              for (let x = 0; x < width; x++) {
                const at = (y * width + x) * 4;
                const gray =
                  (Math.floor((x + origin.x) / cellSize) + Math.floor((y + origin.y) / cellSize)) %
                  2
                    ? 192
                    : 128;
                for (let channel = 0; channel < 3; channel++)
                  opaque[at + channel] = Math.round(
                    (data[at + channel] * data[at + 3] + gray * (255 - data[at + 3])) / 255,
                  );
                opaque[at + 3] = 255;
              }
            for (const ratio of [0.17, 0.5, 1, 1.25, 2]) {
              const renderer = new CanvasRenderer({ ...origin, width, height });
              renderer.setPixelRatio(ratio, ratio * 0.83);
              const expected = renderer.render({ width, height, data: opaque }).data.slice();
              const actual = renderer.render(source, checker);
              assert.deepEqual(
                actual.data,
                expected,
                `offset ${offset}, origin ${origin.x}, checker ${cellSize}, DPR ${ratio}`,
              );
              assert.equal(
                renderer.render(source, checker),
                actual,
                "one bounded output buffer is reused",
              );
            }
          }
        }
        assert.deepEqual(data, before, "presentation keeps the borrowed source intact");
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
