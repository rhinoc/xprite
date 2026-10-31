import { beforeEach, describe, expect, test, vi } from "vitest";

import type { PixelBuffer } from "$/base/primitives";
import type { ArbitratedGrid, GridEvidence } from "$/import-export/image/import/grid-arbitrate";
import { describeImage, type GridCuts } from "$/import-export/image/import/grid-description-length";
import {
  detectWithAlgorithm,
  detectWithAlgorithmAsync,
} from "$/import-export/image/import/pixelation-algorithm-registry";
import { PixelationAlgorithm, type PixelGridAnalysis } from "$/import-export/image/import/types";

const state = vi.hoisted(() => ({
  angle: 0,
  events: [] as string[],
  upright: null as PixelBuffer | null,
  outputs: [] as PixelGridAnalysis[],
  mesh: [] as PixelGridAnalysis[],
  frame: [] as PixelGridAnalysis[],
  pitch: [] as PixelGridAnalysis[],
  distance: [] as PixelGridAnalysis[],
  fixedLength: null as ((cuts: GridCuts) => number) | null,
  fixedReads: [] as GridCuts[],
  descriptions: [] as PixelBuffer[],
  consensus: null as { cols: number; rows: number } | null,
  consensusFor: null as ((image: PixelBuffer) => { cols: number; rows: number } | null) | null,
  winner: null as ArbitratedGrid | null,
  winnerFor: null as ((image: PixelBuffer) => ArbitratedGrid | null) | null,
  read: null as ((grids: readonly PixelGridAnalysis[]) => GridEvidence[]) | null,
  reads: [] as (readonly PixelGridAnalysis[])[],
}));

vi.mock("$/import-export/image/import/deskew", () => ({
  estimateTilt: () => ({ angle: state.angle, extreme: false }),
  straighten: () => {
    state.events.push("straighten");
    return state.upright;
  },
}));
vi.mock("$/import-export/image/import/grid-ac-rl-consensus", () => ({
  beginAcRlConsensusJob: (image: PixelBuffer) => {
    state.events.push("begin");
    return { image };
  },
  beginAcRlConsensusJobAsync: async (image: PixelBuffer) => {
    state.events.push("begin");
    return { image };
  },
  finishAcRlConsensusJob: ({ image }: { image: PixelBuffer }) => {
    state.events.push("finish");
    return state.consensusFor ? state.consensusFor(image) : state.consensus;
  },
  finishAcRlConsensusJobAsync: async ({ image }: { image: PixelBuffer }) => {
    state.events.push("finish");
    return state.consensusFor ? state.consensusFor(image) : state.consensus;
  },
}));
vi.mock("$/import-export/image/import/grid-detect", () => ({
  detectUniformGrid: () => {
    state.events.push("propose");
    return state.outputs[0] ?? { reliable: false };
  },
  detectMeshGrid: () => state.mesh[0] ?? { reliable: false },
}));
vi.mock("$/import-export/image/import/grid-frame-lattice", () => ({
  detectFrameLattices: () => state.frame,
}));
vi.mock("$/import-export/image/import/grid-pitch-lattice", () => ({
  pitchLattices: () => state.pitch,
}));
vi.mock("$/import-export/image/import/grid-period-comb", () => ({ combCountGrids: () => [] }));
vi.mock("$/import-export/image/import/grid-period-boundary", () => ({
  detectBoundaryPeriodGrids: () => [],
}));
vi.mock("$/import-export/image/import/grid-period-distance", () => ({
  distanceCountGrids: () => state.distance,
}));
vi.mock("$/import-export/image/import/grid-description-length", () => ({
  CutModel: { Lattice: "lattice" },
  describeImage: (source: PixelBuffer) => {
    state.descriptions.push(source);
    return { content: source };
  },
  descriptionLength: (_described: unknown, cuts: GridCuts) => {
    state.fixedReads.push(cuts);
    return state.fixedLength?.(cuts) ?? 10;
  },
}));
vi.mock("$/import-export/image/import/grid-arbitrate", () => ({
  GridEvidenceReader: class {
    read(grids: readonly PixelGridAnalysis[]) {
      state.reads.push(grids);
      return { readings: state.read?.(grids) ?? [], pixels: 1 };
    }
  },
  arbitrateGrids: (image: PixelBuffer) => (state.winnerFor ? state.winnerFor(image) : state.winner),
  phaseScore: (reading: GridEvidence) => reading.length,
  octaveShortfall: () => 0,
  twinCuts: (cuts: readonly number[]) => [
    0,
    ...cuts.slice(0, -1).map((start, i) => Math.round((start + cuts[i + 1]) / 2)),
    cuts[cuts.length - 1],
  ],
}));

const image = (): PixelBuffer => ({
  width: 48,
  height: 48,
  data: new Uint8ClampedArray(48 * 48 * 4),
});
const grid = (cells: number, algorithm = PixelationAlgorithm.UniformGrid): PixelGridAnalysis => ({
  width: cells,
  height: cells,
  cellWidth: 48 / cells,
  cellHeight: 48 / cells,
  offsetX: 0,
  offsetY: 0,
  cutsX: Array.from({ length: cells + 1 }, (_, i) => Math.round((i * 48) / cells)),
  cutsY: Array.from({ length: cells + 1 }, (_, i) => Math.round((i * 48) / cells)),
  confidence: 0.9,
  reliable: true,
  algorithm,
});
const reading = (proposal: PixelGridAnalysis, length: number): GridEvidence => ({
  grid: proposal,
  length,
  twin: 100,
  chance: 0,
  frame: () => describeImage(image()),
});

beforeEach(() => {
  state.angle = 0;
  state.events = [];
  state.upright = image();
  state.outputs = [];
  state.mesh = [];
  state.frame = [];
  state.pitch = [];
  state.distance = [];
  state.fixedLength = null;
  state.fixedReads = [];
  state.descriptions = [];
  state.consensus = null;
  state.consensusFor = null;
  state.winner = { grid: grid(12), length: -100, score: -100 };
  state.winnerFor = null;
  state.read = null;
  state.reads = [];
});

describe.each([
  ["sync", (source: PixelBuffer) => detectWithAlgorithm(source)],
  ["async", (source: PixelBuffer) => detectWithAlgorithmAsync(source)],
] as const)("Auto consensus (%s)", (_name, detect) => {
  test("starts the tilted view's WASM job before its proposers and joins that same job once", async () => {
    state.angle = 1;
    state.outputs = [grid(12)];
    await detect(image());
    expect(state.events).toEqual(["straighten", "begin", "propose", "finish"]);
  });

  test("scores the whole-frame consensus partition on the original image", async () => {
    state.consensus = { cols: 8, rows: 8 };
    const source = image();
    const result = await detect(source);
    expect([result.width, result.height]).toEqual([8, 8]);
    const cuts = Array.from({ length: 9 }, (_, index) => index * 6);
    expect(result.cutsX).toEqual(cuts);
    expect(result.cutsY).toEqual(cuts);
    expect([result.offsetX, result.offsetY]).toEqual([0, 0]);
    expect(state.fixedReads).toHaveLength(2);
    expect(state.descriptions).toEqual([source]);
    expect(state.reads).toEqual([]);
    expect(result.sampling).toBeUndefined();
  });

  test("rounds fractional whole-frame cells once without adding or dropping edge cells", async () => {
    state.consensus = { cols: 20, rows: 20 };
    const result = await detect({
      width: 50,
      height: 50,
      data: new Uint8ClampedArray(50 * 50 * 4),
    });
    const cuts = Array.from({ length: 21 }, (_, index) => Math.round(index * 2.5));
    expect(result.cutsX).toEqual(cuts);
    expect(result.cutsY).toEqual(cuts);
    expect([result.cutsX!.length, result.cutsY!.length]).toEqual([21, 21]);
    expect([result.offsetX, result.offsetY]).toEqual([0, 0]);
    expect(result.sampling).toBeUndefined();
    expect(state.fixedReads).toHaveLength(2);
  });

  test("keeps the existing winner when the rebuilt geometry has no valid reading", async () => {
    state.consensus = { cols: 8, rows: 8 };
    state.outputs = [grid(8)];
    state.read = () => [];
    expect(await detect(image())).toEqual(state.winner!.grid);
  });

  test.each([
    { cols: 0, rows: 8 },
    { cols: 8.5, rows: 8 },
    { cols: 513, rows: 8 },
  ])("does not materialize unsupported consensus dimensions %j", async (consensus) => {
    state.consensus = consensus;
    expect(await detect(image())).toEqual(state.winner!.grid);
    expect(state.reads).toEqual([]);
    expect(state.fixedReads).toEqual([]);
  });

  test("uses the rebuilt score when comparing upright and original views", async () => {
    state.angle = 1;
    state.consensusFor = (source) => (source === state.upright ? { cols: 8, rows: 8 } : null);
    const originalWinner = { grid: grid(10), length: 0, score: 0 };
    state.winnerFor = (source) => (source === state.upright ? state.winner : originalWinner);
    state.read = (proposals) => proposals.map((proposal) => reading(proposal, 10));
    const result = await detect(image());
    expect(result).toEqual(originalWinner.grid);
    expect(result.rotation).toBeUndefined();
  });

  test.each([
    { consensus: true, corroborated: false },
    { consensus: false, corroborated: false },
    { consensus: false, corroborated: true },
  ])("requires independent count support for an additional original view %j", async (policy) => {
    state.angle = 1;
    state.pitch = [grid(10)];
    state.frame = policy.corroborated ? [grid(10)] : [];
    state.consensus = policy.consensus ? { cols: 12, rows: 12 } : null;
    const originalWinner = { grid: grid(10), length: -101, score: -101 };
    state.winnerFor = (source) => (source === state.upright ? state.winner : originalWinner);
    const result = await detect(image());
    const acceptsOriginal = !policy.consensus && policy.corroborated;
    expect([result.width, result.height]).toEqual(acceptsOriginal ? [10, 10] : [12, 12]);
    expect(result.rotation).toBe(acceptsOriginal ? undefined : 1);
    expect(state.events.filter((event) => event === "begin")).toHaveLength(
      policy.consensus ? 1 : 2,
    );
  });

  test("corroborating a size preserves the proposer's correction confidence", async () => {
    const chosen = { ...grid(8), confidence: 0 };
    state.frame = [grid(9)];
    state.pitch = [chosen];
    state.distance = [chosen];
    state.winner = { grid: grid(9), length: 1, score: 1 };
    state.read = (proposals) =>
      proposals.map((proposal) => reading(proposal, proposal.width === 8 ? 1.1 : 1));
    const result = await detect(image());
    expect([result.width, result.height]).toEqual([8, 8]);
    expect(result.confidence).toBe(0);
    expect(result.reliable).toBe(true);
  });

  test.each([false, true])(
    "evaluates all matching Free/Lattice geometries (reverse %s)",
    async (reverse) => {
      state.consensus = { cols: 8, rows: 8 };
      const uniform = grid(8);
      const free = grid(8, PixelationAlgorithm.EdgeGrid);
      uniform.cutsX = uniform.cutsX!.map((value, i) => (i === 1 ? 5 : value));
      free.cutsX = free.cutsX!.map((value, i) => (i === 1 ? 7 : value));
      const [first, second] = reverse ? [free, uniform] : [uniform, free];
      state.outputs = [first];
      state.mesh = [second];
      state.read = (proposals) =>
        proposals.map((proposal) => reading(proposal, proposal.cutsX![1] === 7 ? 1 : 10));
      const result = await detect(image());
      expect(result.cutsX![1]).toBe(7);
      expect(state.reads[0]).toHaveLength(2);
    },
  );
});
