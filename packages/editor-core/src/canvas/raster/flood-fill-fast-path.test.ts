import assert from "node:assert/strict";

import { describe, it } from "vitest";

import type { Rect, Rgba } from "$/base/primitives";
import { floodFill } from "$/canvas/raster";
import type { RasterOptions } from "$/canvas/raster/types";

describe("in-place exact fills", () => {
  it("matches independent-source fills for alpha, holes, clips and no-op colors", () => {
    for (const transparent of [false, true]) {
      for (const clipped of [false, true]) {
        for (const replacement of [
          [13, 21, 34, 255],
          [80, 90, 100, 255],
        ] as Rgba[]) {
          const image = { width: 19, height: 13, data: new Uint8ClampedArray(19 * 13 * 4) };
          for (let y = 0; y < image.height; y++)
            for (let x = 0; x < image.width; x++) {
              const barrier = x === 9 && y !== 6;
              image.data.set(
                barrier
                  ? [80, 90, 100, 255]
                  : [13 + (transparent ? x : 0), 21, 34, transparent ? 0 : 255],
                (y * image.width + x) * 4,
              );
            }
          const slow = { ...image, data: image.data.slice() };
          const reference = { ...image, data: image.data.slice() };
          const captures: Rect[][] = [[], []];
          const options: RasterOptions & { tolerance: number; contiguous: boolean } = {
            brush: { shape: "square", size: 1, angle: 0 },
            color: replacement,
            tolerance: 0,
            contiguous: true,
            ...(clipped ? { clip: { x: 2.5, y: 1.5, width: 13.5, height: 9.5 } } : {}),
          };
          const fastResult = floodFill(
            image,
            { x: 4, y: 4 },
            {
              ...options,
              beforeWrite: (rect) => captures[0].push(rect),
            },
          );
          const slowResult = floodFill(
            slow,
            { x: 4, y: 4 },
            {
              ...options,
              referenceImage: reference,
              beforeWrite: (rect) => captures[1].push(rect),
            },
          );
          assert.deepEqual(image.data, slow.data);
          assert.deepEqual(fastResult, slowResult);
          assert.deepEqual(captures[0], captures[1]);
        }
      }
    }
  });
});
