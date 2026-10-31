import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { pitchLattices } from "$/import-export/image/import/grid/detect/pitch-lattice";
import {
  detailedSprite,
  fractionalUpscale,
  gradient,
  upscaleNearest,
} from "$/import-export/image/import/grid/test-images";
import { PixelationAlgorithm } from "$/import-export/image/import/types";

function translucentSprite(): PixelBuffer {
  const image = detailedSprite(16, 12, 11);
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++)
      image.data[(y * image.width + x) * 4 + 3] =
        (x + 3 * y) % 5 === 0 ? 0 : 31 + Math.round((224 * x) / (image.width - 1));
  return image;
}

// Captured from the complete proposer lists before the residual-loop optimization. The digest
// covers cuts, fitted pitches/phases, metadata and ordering, including equal-size proposals.
const cases = [
  {
    name: "nearest cells retain every proposal and tie order",
    image: () => upscaleNearest(detailedSprite(16, 12, 11), 4),
    dimensions: [
      [16, 12],
      [16, 12],
      [9, 7],
      [16, 12],
      [6, 5],
      [12, 9],
      [19, 14],
    ],
    digest: "3cf6f03dcc95423cfc73f90ce41bf8f4cca4cc45475a38f1b5e5386d219b533e",
  },
  {
    name: "fractional cells retain fitting with transparent and partially opaque pixels",
    image: () => fractionalUpscale(translucentSprite(), 3.6),
    dimensions: [
      [9, 7],
      [16, 12],
      [16, 12],
    ],
    digest: "3d6a0caafa5c4162eac554c80d1ff9dedc51823773c234caabaee94ee4c8703f",
  },
  {
    name: "wide fitting retains results when interval tables exceed the cache budget",
    // At 1024 x 128, the fine horizontal axis can cache eight segment-size tables. This
    // fixture requests further sizes, exercising cached and direct residuals in one sweep.
    image: () => upscaleNearest(detailedSprite(256, 32, 13), 4),
    dimensions: [
      [256, 32],
      [171, 22],
      [256, 32],
    ],
    digest: "b79f53bf74e3a1c0458330d14ca24f1cf9b747e0c764119affe071e108f8f173",
  },
] as const;

describe("pitch lattice residual fitting", () => {
  for (const { name, image, dimensions, digest } of cases)
    test(name, () => {
      const proposals = pitchLattices(image());
      expect(proposals.map((grid) => [grid.width, grid.height])).toEqual(dimensions);
      for (const grid of proposals)
        expect(grid).toMatchObject({
          algorithm: PixelationAlgorithm.UniformGrid,
          reliable: true,
          confidence: 0,
        });
      const signature = proposals.map((grid) => [
        grid.width,
        grid.height,
        grid.cellWidth,
        grid.cellHeight,
        grid.offsetX,
        grid.offsetY,
        grid.cutsX,
        grid.cutsY,
        grid.confidence,
        grid.reliable,
        grid.algorithm,
      ]);
      expect(createHash("sha256").update(JSON.stringify(signature)).digest("hex")).toBe(digest);
    });

  test("a smooth field has no periodic lattice proposals", () => {
    expect(pitchLattices(gradient(48, 32))).toEqual([]);
  });
});
