import { describe, expect, test } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { pixelGridCuts } from "$/import-export/image/import/grid";
import { coherentGrids } from "$/import-export/image/import/grid-edge-coherence";
import {
  blockResetUpscale,
  boxBlur,
  driftUpscale,
  sprite,
  upscaleNearest,
} from "$/import-export/image/import/grid-test-images";
import { PixelationAlgorithm, type PixelGridAnalysis } from "$/import-export/image/import/types";

/** A lattice of `columns` by `rows` cells that covers the image. */
function lattice(image: PixelBuffer, columns: number, rows: number): PixelGridAnalysis {
  const cellWidth = image.width / columns,
    cellHeight = image.height / rows;
  return {
    width: columns,
    height: rows,
    cellWidth,
    cellHeight,
    offsetX: 0,
    offsetY: 0,
    cutsX: pixelGridCuts(image.width, cellWidth),
    cutsY: pixelGridCuts(image.height, cellHeight),
    confidence: 0,
    reliable: true,
    algorithm: PixelationAlgorithm.UniformGrid,
  };
}

const sizes = (grids: readonly PixelGridAnalysis[][]) =>
  grids.flat().map(({ width, height }) => `${width}x${height}`);

describe("edge coherence", () => {
  test("a soft upscale's third pitch lattice is not read", () => {
    const image = boxBlur(upscaleNearest(sprite(40, 41), 9), 1);
    const read = sizes(
      coherentGrids(image, [[lattice(image, 40, 40)], [lattice(image, 120, 120)]]),
    );
    expect(read).toEqual(["40x40"]);
  });

  test("a blurred upscale keeps every proposal", () => {
    const image = boxBlur(upscaleNearest(sprite(48, 3), 3), 1);
    const proposals = [[lattice(image, 48, 48), lattice(image, 96, 96)]];
    expect(sizes(coherentGrids(image, proposals))).toEqual(["48x48", "96x96"]);
  });

  test("drifting and re-blocked upscales keep their true count", () => {
    for (const image of [
      driftUpscale(sprite(64, 9), 7.25, 0.08),
      blockResetUpscale(sprite(64, 9), 5.3, 3),
    ]) {
      const proposals = [64, 66, 67, 128].map((cells) => [lattice(image, cells, cells)]);
      expect(sizes(coherentGrids(image, proposals))).toContain("64x64");
    }
  });

  test("grids under two pixels per cell are always read", () => {
    const image = upscaleNearest(sprite(32, 7), 3);
    const read = sizes(coherentGrids(image, [[lattice(image, 32, 32), lattice(image, 64, 64)]]));
    expect(read).toContain("64x64");
  });
});
