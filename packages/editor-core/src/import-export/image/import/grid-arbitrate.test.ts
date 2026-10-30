import { describe, expect, test, vi } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import {
  arbitrateGrids,
  classTwinCuts,
  GridEvidenceReader,
  twinCuts,
  type GridEvidence,
} from "$/import-export/image/import/grid-arbitrate";
import * as phaseFields from "$/import-export/image/import/grid-phase-field";
import { materializeGridImage } from "$/import-export/image/import/grid-sampling";
import * as stripShifts from "$/import-export/image/import/grid-strip-shift";
import {
  blockResetUpscale,
  gradient,
  mush,
  resampleBilinear,
  rowJitterUpscale,
  smoothPhoto,
  sprite,
  texturedUpscale,
  upscaleBilinear,
  upscaleNearest,
  warpUpscale,
} from "$/import-export/image/import/grid-test-images";
import { PixelationAlgorithm, type PixelGridAnalysis } from "$/import-export/image/import/types";

const STRIDE = 4;
const OPAQUE_WHITE = 255;

const lattice = (image: PixelBuffer, pitch: number, offset = 0): PixelGridAnalysis => ({
  width: Math.round(image.width / pitch),
  height: Math.round(image.height / pitch),
  cellWidth: pitch,
  cellHeight: pitch,
  offsetX: offset,
  offsetY: offset,
  confidence: 0,
  reliable: false,
  algorithm: PixelationAlgorithm.UniformGrid,
});

/** A square grid given by its cuts, the same on both axes. */
const cutGrid = (cuts: number[]): PixelGridAnalysis => ({
  width: cuts.length - 1,
  height: cuts.length - 1,
  cellWidth: cuts[cuts.length - 1] / (cuts.length - 1),
  cellHeight: cuts[cuts.length - 1] / (cuts.length - 1),
  offsetX: 0,
  offsetY: 0,
  cutsX: cuts,
  cutsY: cuts,
  confidence: 0,
  reliable: false,
  algorithm: PixelationAlgorithm.UniformGrid,
});

/** Cuts every `pitch` pixels from `offset`, inside [0, length]. */
function latticeCuts(pitch: number, offset: number, length: number): number[] {
  const cuts = [0];
  for (let k = 0; ; k++) {
    const at = Math.round(offset + k * pitch);
    if (at >= length) break;
    if (at > 0) cuts.push(at);
  }
  cuts.push(length);
  return cuts;
}

/** The image inside a white border `margin` pixels wide. */
function framed(image: PixelBuffer, margin: number): PixelBuffer {
  const width = image.width + 2 * margin,
    height = image.height + 2 * margin;
  const data = new Uint8ClampedArray(width * height * STRIDE).fill(OPAQUE_WHITE);
  for (let y = 0; y < image.height; y++)
    data.set(
      image.data.subarray(y * image.width * STRIDE, (y + 1) * image.width * STRIDE),
      ((y + margin) * width + margin) * STRIDE,
    );
  return { width, height, data };
}

const octaves = (image: PixelBuffer, pitch: number) =>
  [pitch / 2, pitch, pitch * 2].map((p) => lattice(image, p));

const size = (image: PixelBuffer, grids: readonly PixelGridAnalysis[]) => {
  const result = arbitrateGrids(image, grids);
  return result && [result.grid.width, result.grid.height];
};

describe("twin cuts", () => {
  test("put one cut at each cell middle inside the same extent", () => {
    expect(twinCuts([0, 4, 8, 12])).toEqual([0, 2, 6, 10, 12]);
  });

  test("of one class move every period-th inner cut to its cell middle", () => {
    expect(classTwinCuts([0, 4, 8, 12, 16], 2, 1)).toEqual([0, 6, 8, 14, 16]);
  });
});

describe("one score over every proposal and the passthrough", () => {
  test("reused evidence preserves cut models, geometry and each proposal list's confidence", () => {
    const image = rowJitterUpscale(sprite(16), 5, 1.2);
    const grid = lattice(image, 5);
    const mesh = { ...grid, algorithm: PixelationAlgorithm.EdgeGrid };
    const offset = lattice(image, 5, 1);
    const highConfidence = { ...grid, confidence: 0.95, reliable: true };
    const evidence = new GridEvidenceReader(image);
    const summarize = ({ readings, pixels }: ReturnType<GridEvidenceReader["read"]>) => ({
      pixels,
      readings: readings.map(({ frame, ...reading }) => {
        const description = frame();
        return {
          ...reading,
          frame: { ...description, content: materializeGridImage(description.content) },
        };
      }),
    });
    for (const grids of [[grid], [mesh], [offset], [highConfidence, offset], [offset, grid], []]) {
      expect(summarize(evidence.read(grids))).toEqual(
        summarize(new GridEvidenceReader(image).read(grids)),
      );
      expect(arbitrateGrids(image, grids, evidence)).toEqual(arbitrateGrids(image, grids));
    }
  });

  test("the same geometry keeps both free and lattice models in either proposal order", () => {
    const image = upscaleNearest(sprite(16), 5);
    const grid = lattice(image, 5);
    const mesh = { ...grid, algorithm: PixelationAlgorithm.EdgeGrid };
    const evidence = new GridEvidenceReader(image);
    const summarize = (grids: readonly PixelGridAnalysis[]) =>
      evidence.read(grids).readings.map(({ grid: found, length, twin, chance }) => ({
        algorithm: found.algorithm,
        cutsX: found.cutsX,
        cutsY: found.cutsY,
        length,
        twin,
        chance,
      }));
    const combined = summarize([grid, mesh]);
    expect(combined).toHaveLength(2);
    expect(combined).toEqual(summarize([mesh, grid]));
    for (const proposal of [grid, mesh])
      expect(combined.find(({ algorithm }) => algorithm === proposal.algorithm)).toEqual(
        summarize([proposal])[0],
      );
    expect(arbitrateGrids(image, [grid, mesh], evidence)).toEqual(
      arbitrateGrids(image, [mesh, grid], evidence),
    );
  });

  test("free and lattice readings share geometry work while preserving independently scored evidence", () => {
    const image = rowJitterUpscale(sprite(16), 5, 1.2);
    const grid = lattice(image, 5);
    const mesh = { ...grid, algorithm: PixelationAlgorithm.EdgeGrid };
    const snapshot = ({ frame, ...reading }: GridEvidence) => {
      const description = frame();
      return {
        ...reading,
        frame: { ...description, content: materializeGridImage(description.content) },
      };
    };
    const independent = [grid, mesh].map((proposal) =>
      snapshot(new GridEvidenceReader(image).read([proposal]).readings[0]),
    );
    const fields = vi.spyOn(phaseFields, "phaseField");
    const strips = vi.spyOn(stripShifts, "stripShear");
    try {
      const evidence = new GridEvidenceReader(image);
      const combined = evidence.read([grid, mesh]).readings;
      for (const reading of combined)
        expect(snapshot(reading)).toEqual(
          independent.find(({ grid: proposal }) => proposal.algorithm === reading.grid.algorithm),
        );
      expect(fields).toHaveBeenCalledTimes(1);
      expect(strips).toHaveBeenCalledTimes(1);
      evidence.read([mesh]);
      evidence.read([grid]);
      expect(fields).toHaveBeenCalledTimes(1);
      expect(strips).toHaveBeenCalledTimes(1);
      evidence.read([lattice(image, 5, 1)]);
      expect(fields).toHaveBeenCalledTimes(2);
      expect(strips).toHaveBeenCalledTimes(2);
    } finally {
      fields.mockRestore();
      strips.mockRestore();
    }
  });

  test("a strong geometry retains both cut models while admission limits distinct weak geometry", () => {
    const image = upscaleNearest(sprite(32), 6);
    const strong = { ...lattice(image, 6), confidence: 0.95, reliable: true };
    const mesh = { ...strong, algorithm: PixelationAlgorithm.EdgeGrid, confidence: 0.1 };
    const weaker = { ...lattice(image, 3), confidence: 0.1, reliable: true };
    const proposals = [weaker, mesh, strong];
    const evidence = new GridEvidenceReader(image);
    const { readings } = evidence.read(proposals);
    expect(readings).toHaveLength(2);
    expect(readings.map(({ grid }) => grid.algorithm)).toEqual([
      PixelationAlgorithm.UniformGrid,
      PixelationAlgorithm.EdgeGrid,
    ]);
    expect(
      readings.every(({ grid }) => grid.width === strong.width && grid.height === strong.height),
    ).toBe(true);
    expect(size(image, proposals)).toEqual([32, 32]);
    expect(size(image, [...proposals].reverse())).toEqual([32, 32]);
  });

  test("distinct weaker geometry remains eligible without a strong proposal", () => {
    const image = upscaleNearest(sprite(16), 6);
    const stronger = { ...lattice(image, 6), confidence: 0.8, reliable: true };
    const weaker = { ...lattice(image, 3), confidence: 0.1, reliable: true };
    const { readings } = new GridEvidenceReader(image).read([stronger, weaker]);
    expect(readings).toHaveLength(2);
  });

  test("duplicate readings retain the strongest proposal without leaking cached confidence", () => {
    const image = upscaleNearest(sprite(16), 5);
    const grid = lattice(image, 5);
    const stronger = { ...grid, confidence: 0.8, reliable: true };
    const weaker = { ...grid, confidence: 0.2 };
    const proposals = [weaker, stronger];
    const evidence = new GridEvidenceReader(image);
    const [reading] = evidence.read(proposals).readings;
    expect(evidence.read(proposals).readings).toHaveLength(1);
    expect(reading.grid.confidence).toBe(stronger.confidence);
    expect(evidence.read([...proposals].reverse()).readings[0].grid).toEqual(reading.grid);
    expect(evidence.read([weaker]).readings[0].grid.confidence).toBe(weaker.confidence);
  });

  test("refuses when nothing is proposed", () => {
    expect(arbitrateGrids(upscaleNearest(sprite(32), 4), [])).toBeNull();
  });

  test("a true lattice beats its finer and coarser octaves", () => {
    const image = upscaleNearest(sprite(32), 6);
    expect(size(image, octaves(image, 6))).toEqual([32, 32]);
  });

  test("a bilinear upscale is read at its own pitch, not at half of it", () => {
    const image = resampleBilinear(sprite(32), 12);
    expect(size(image, octaves(image, 12))).toEqual([32, 32]);
  });

  test("a corner-aligned bilinear upscale keeps its pitch, centred on its samples", () => {
    const image = upscaleBilinear(sprite(32), 12);
    const grids = [6, 12, 24].map((pitch) => cutGrid(latticeCuts(pitch, pitch / 2, image.width)));
    expect(size(image, grids)).toEqual([33, 33]);
  });

  test("a blurred, noisy upscale without edges keeps its pitch", () => {
    const image = mush(sprite(32), 12);
    expect(size(image, octaves(image, 12))).toEqual([32, 32]);
  });

  test.each([
    ["a warped", warpUpscale(sprite(32), 6, 1)],
    ["a row-jittered", rowJitterUpscale(sprite(32), 6, 1.2)],
    ["a block-reset", blockResetUpscale(sprite(32), 6, 2)],
  ])("%s upscale is read through its shifts at its true count", (_, image) => {
    expect(size(image, octaves(image, 6))).toEqual([32, 32]);
  });

  test("a textured upscale keeps its pitch rather than a finer octave", () => {
    const image = texturedUpscale(sprite(32), 8, 0.3);
    expect(size(image, octaves(image, 8))).toEqual([32, 32]);
  });

  test("a frame around the content does not displace the grid it encloses", () => {
    const pitch = 8,
      cells = 24,
      margin = 3;
    const image = framed(upscaleNearest(sprite(cells), pitch), margin);
    const enclosing = [
      0,
      ...Array.from({ length: cells - 1 }, (_, k) => margin + (k + 1) * pitch),
      image.width,
    ];
    const finer = [pitch / 2, pitch / 3].map((p) => cutGrid(latticeCuts(p, margin, image.width)));
    expect(size(image, [cutGrid(enclosing), ...finer])).toEqual([cells, cells]);
  });

  test("the winner does not depend on the order of the proposals", () => {
    const image = upscaleNearest(sprite(40), 5);
    const grids = octaves(image, 5);
    expect(size(image, [...grids].reverse())).toEqual(size(image, grids));
  });

  test("snapping does not move the cuts of an exact lattice", () => {
    const image = upscaleNearest(sprite(32), 6);
    const result = arbitrateGrids(image, [lattice(image, 6)]);
    expect(result?.grid.cutsX).toEqual(latticeCuts(6, 0, image.width));
  });

  test("native pixel art passes through rather than taking an invented coarse grid", () => {
    const image = sprite(64);
    expect(size(image, [lattice(image, 2), lattice(image, 4)])).toBeNull();
  });

  test.each([
    ["a smooth photo", smoothPhoto(240, 180)],
    ["a gradient", gradient(240, 180)],
  ])("%s carries no phase evidence and passes through", (_, image) => {
    expect(
      size(
        image,
        [4, 6, 8].map((p) => lattice(image, p)),
      ),
    ).toBeNull();
  });

  test("a locked lattice describes the image markedly better than its twin", () => {
    const image = upscaleNearest(sprite(32), 6);
    const { readings, pixels } = new GridEvidenceReader(image).read([lattice(image, 6)]);
    const [reading] = readings;
    expect(reading.twin).toBeGreaterThan(reading.length);
    expect(reading.length).toBeLessThan(pixels);
    expect(reading.chance).toBe(0);
  });

  test("a strip-shifted reading owns more phase evidence than its search finds by chance", () => {
    const image = rowJitterUpscale(sprite(32), 6, 1.2);
    const [reading] = new GridEvidenceReader(image).read([lattice(image, 6)]).readings;
    expect(reading.chance).toBeGreaterThan(0);
    expect(reading.twin - reading.length).toBeGreaterThan(2 * reading.chance);
  });
});
