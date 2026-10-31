import { describe, expect, test, vi } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import { blockPartition } from "$/import-export/image/import/grid/lattice";
import { detectWithAlgorithm } from "$/import-export/image/import/grid/registry";
import { pixelateImage } from "$/import-export/image/import/pixelate";
import {
  CellColorPicker,
  PixelationAlgorithm,
  PixelationMode,
} from "$/import-export/image/import/types";

vi.mock("$/import-export/image/import/prepass/deskew", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$/import-export/image/import/prepass/deskew")>()),
  estimateTilt: () => ({ angle: 0, extreme: false }),
}));
vi.mock("$/import-export/image/import/grid/period/ac-rl-consensus", () => ({
  beginAcRlConsensusJob: () => ({}),
  finishAcRlConsensusJob: () => ({ cols: 16, rows: 16 }),
}));
vi.mock("$/import-export/image/import/grid/detect/detect", () => ({
  detectUniformGrid: () => ({ reliable: false }),
  detectMeshGrid: () => ({ reliable: false }),
}));
vi.mock("$/import-export/image/import/grid/detect/frame-lattice", () => ({
  detectFrameLattices: () => [],
}));
vi.mock("$/import-export/image/import/grid/detect/pitch-lattice", () => ({
  pitchLattices: () => [],
}));
vi.mock("$/import-export/image/import/grid/period/comb", () => ({ combCountGrids: () => [] }));
vi.mock("$/import-export/image/import/grid/period/boundary", () => ({
  detectBoundaryPeriodGrids: () => [],
}));
vi.mock("$/import-export/image/import/grid/period/distance", () => ({
  distanceCountGrids: () => [],
}));
vi.mock("$/import-export/image/import/grid/arbitrate/arbitrate", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("$/import-export/image/import/grid/arbitrate/arbitrate")
  >()),
  arbitrateGrids: (source: PixelBuffer) => ({
    grid: {
      ...blockPartition(source, 17, 17),
      confidence: 0.4,
      reliable: true,
      algorithm: PixelationAlgorithm.UniformGrid,
    },
    length: -100,
    score: -100,
  }),
}));

function cleanUpscale(): { art: PixelBuffer; source: PixelBuffer } {
  const size = 16;
  const scale = 6;
  const palette = [
    [0, 0, 0, 255],
    [255, 0, 0, 255],
    [0, 255, 0, 255],
  ];
  const art: PixelBuffer = {
    width: size,
    height: size,
    data: new Uint8ClampedArray(size * size * 4),
  };
  let seed = 12345;
  for (let pixel = 0; pixel < size * size; pixel++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    art.data.set(palette[seed % palette.length], pixel * 4);
  }
  const source: PixelBuffer = {
    width: size * scale,
    height: size * scale,
    data: new Uint8ClampedArray(size * size * scale * scale * 4),
  };
  for (let y = 0; y < source.height; y++)
    for (let x = 0; x < source.width; x++) {
      const from = (Math.floor(y / scale) * size + Math.floor(x / scale)) * 4;
      source.data.set(art.data.subarray(from, from + 4), (y * source.width + x) * 4);
    }
  return { art, source };
}

describe("coloring a dimension-only consensus", () => {
  test("scores and samples the same original-frame lattice without inventing local warps", () => {
    const { art, source } = cleanUpscale();
    const grid = detectWithAlgorithm(source);
    expect([grid.width, grid.height]).toEqual([art.width, art.height]);
    expect(grid.cutsX).toEqual(Array.from({ length: 17 }, (_, index) => index * 6));
    expect(grid.cutsY).toEqual(grid.cutsX);
    expect(grid.sampling).toBeUndefined();
    const restored = pixelateImage(source, {
      grid,
      mode: PixelationMode.RecoverGrid,
      algorithm: PixelationAlgorithm.Auto,
      colorPicker: CellColorPicker.TwoStage,
    });
    expect(restored.data).toEqual(art.data);
  });
});
