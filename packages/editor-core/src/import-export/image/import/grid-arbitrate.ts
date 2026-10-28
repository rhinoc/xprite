import type { PixelBuffer } from "$/base/primitives";
import { MAX_RECOVERED_GRID_SIZE, pixelGridCuts } from "$/import-export/image/import/grid";
import { snapLatticeCuts } from "$/import-export/image/import/grid-cut-snap";
import {
  CutModel,
  describeImage,
  descriptionLength,
  pixelLength,
  type DescribedImage,
  type GridCuts,
} from "$/import-export/image/import/grid-description-length";
import {
  chanceEvidence,
  StripImage,
  stripShear,
} from "$/import-export/image/import/grid-strip-shift";
import { PixelationAlgorithm, type PixelGridAnalysis } from "$/import-export/image/import/types";

/**
 * One decision over every proposed grid and the passthrough. Each proposal is read in the ways
 * its cuts allow, and the reading that describes the input shortest stands: an edge mesh as
 * placed; a lattice as cut or with its cuts snapped to the nearest edges (leaving every cut in
 * place is one of the snaps, so the offsets have to pay for themselves); and either of them
 * through strip shifts (see grid-strip-shift), described on the straightened image and paying for
 * the shifts. Every reading carries three numbers:
 *
 * - its description length of the input (see grid-description-length);
 * - the length of its twin: the same model with every cut moved half a cell, onto the cell
 *   middles. A real grid is phase-locked, so its twin describes the input markedly worse; a
 *   grid the content ignores (photos, gradients, a finer or coarser octave of the true grid that
 *   only partly lines up) describes it about as well at either phase. Cuts placed on edges
 *   chose their positions from the input, so their twin settles on edges the same way; it may
 *   not settle on the reading's own cuts, or it would no longer stand at the other phase. The
 *   twin of a strip-shifted reading shifts every strip into the anti-phase of its own shift.
 * - its chance evidence: the phase evidence its strip search finds at pitches the content does
 *   not have, which the reading does not count as its own (none for unshifted readings).
 *
 * A reading scores its length less PHASE_EVIDENCE_WEIGHT times its phase evidence (the twin's
 * length less its own and its chance evidence), so among lattices that describe the image about
 * equally, the one the content is locked to wins. The passthrough carries no phase evidence and
 * scores the shorter of two descriptions without a recovered grid, less NULL_MARGIN:
 *
 * - the image as it is, one cell per pixel (native pixel art and drawings), and
 * - the best length any proposal reaches at the worse of its two phases: what a lattice explains
 *   whatever its phase (smooth photos and gradients) is no evidence of a grid.
 *
 * The lowest score wins; no proposer is consulted or skipped by the kind of image, and no
 * proposal passes a gate of its own.
 */
const PHASE_EVIDENCE_WEIGHT = 1;
/** Nats per sample the passthrough is preferred by. */
const NULL_MARGIN = 0.03;
/**
 * Cells per axis a grid needs: with fewer, a few large features can line up with the cuts by
 * chance and pass for phase evidence.
 */
const MIN_CELLS = 8;
const HALF = 0.5;

/** A grid reading: the hypothesis with its cuts, its length and its twin's, per sample. */
export interface GridEvidence {
  grid: PixelGridAnalysis;
  length: number;
  twin: number;
  /** Phase evidence, per sample, the reading's strip search finds by chance. */
  chance: number;
}

export interface ArbitratedGrid {
  grid: PixelGridAnalysis;
  /** Description length per sample, in nats. */
  length: number;
  /** The decision's score, per sample; lower is better. */
  score: number;
}

const phaseScore = (reading: GridEvidence) =>
  reading.length - PHASE_EVIDENCE_WEIGHT * (reading.twin - reading.length - reading.chance);

/** The cuts moved half a cell: one cut at each cell middle, inside the same extent. */
export function twinCuts(cuts: readonly number[]): number[] {
  const last = cuts[cuts.length - 1];
  const twin = [0];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const middle = Math.round((cuts[i] + cuts[i + 1]) * HALF);
    if (middle > twin[twin.length - 1] && middle < last) twin.push(middle);
  }
  twin.push(last);
  return twin;
}

function cutsOf(image: PixelBuffer, grid: PixelGridAnalysis) {
  return {
    cutsX: [...(grid.cutsX ?? pixelGridCuts(image.width, grid.cellWidth, grid.offsetX))],
    cutsY: [...(grid.cutsY ?? pixelGridCuts(image.height, grid.cellHeight, grid.offsetY))],
  };
}

const keyOf = (cutsX: readonly number[], cutsY: readonly number[]) =>
  `${cutsX.join(",")}|${cutsY.join(",")}`;

/** The twin of cuts placed on edges: settled on edges the same way, but never on its own cuts. */
function settledTwin(
  image: PixelBuffer,
  cutsX: readonly number[],
  cutsY: readonly number[],
  model: CutModel,
): GridCuts {
  const settled = snapLatticeCuts(image, twinCuts(cutsX), twinCuts(cutsY), {
    x: cutsX,
    y: cutsY,
  });
  return {
    cutsX: settled.x.cuts,
    cutsY: settled.y.cuts,
    model,
    radiusX: settled.x.radius,
    radiusY: settled.y.radius,
  };
}

interface Reading {
  cuts: GridCuts;
  length: number;
  twin: number;
  chance: number;
}

/** The proposal as placed or snapped, with the twin to measure it against. */
function placedReading(
  image: PixelBuffer,
  described: DescribedImage,
  grid: PixelGridAnalysis,
  cutsX: number[],
  cutsY: number[],
): { cuts: GridCuts; length: number; twin: () => GridCuts } {
  if (grid.algorithm === PixelationAlgorithm.EdgeGrid) {
    const cuts = { cutsX, cutsY, model: CutModel.Free };
    return {
      cuts,
      length: descriptionLength(described, cuts),
      twin: () => settledTwin(image, cutsX, cutsY, CutModel.Free),
    };
  }
  const lattice = { cutsX, cutsY, model: CutModel.Lattice };
  const latticeLength = descriptionLength(described, lattice);
  const snap = snapLatticeCuts(image, cutsX, cutsY);
  const snapped = {
    cutsX: snap.x.cuts,
    cutsY: snap.y.cuts,
    model: CutModel.Snapped,
    radiusX: snap.x.radius,
    radiusY: snap.y.radius,
  };
  const snappedLength = descriptionLength(described, snapped);
  if (latticeLength <= snappedLength)
    return {
      cuts: lattice,
      length: latticeLength,
      twin: () => ({ cutsX: twinCuts(cutsX), cutsY: twinCuts(cutsY), model: CutModel.Lattice }),
    };
  return {
    cuts: snapped,
    length: snappedLength,
    twin: () => settledTwin(image, snap.x.cuts, snap.y.cuts, CutModel.Snapped),
  };
}

function readingOf(
  strips: StripImage,
  described: DescribedImage,
  grid: PixelGridAnalysis,
  cutsX: number[],
  cutsY: number[],
): Reading {
  const placed = placedReading(strips.image, described, grid, cutsX, cutsY);
  const shear = stripShear(strips, cutsX, cutsY);
  if (shear) {
    const cuts = {
      cutsX,
      cutsY,
      model: grid.algorithm === PixelationAlgorithm.EdgeGrid ? CutModel.Free : CutModel.Lattice,
    };
    const straight = describeImage(shear.straight);
    const cost = shear.cost / straight.samples;
    const length = descriptionLength(straight, cuts) + cost;
    if (length < placed.length)
      return {
        cuts,
        length,
        twin: descriptionLength(describeImage(shear.twin()), cuts) + cost,
        chance: chanceEvidence(strips, cutsX, cutsY),
      };
  }
  return {
    cuts: placed.cuts,
    length: placed.length,
    twin: descriptionLength(described, placed.twin()),
    chance: 0,
  };
}

/** Every distinct reading of the proposals, and the image's own length per sample. */
export function gridEvidence(
  image: PixelBuffer,
  grids: readonly PixelGridAnalysis[],
): { readings: GridEvidence[]; pixels: number } {
  const described = describeImage(image);
  const strips = new StripImage(image);
  const seen = new Set<string>();
  const readings: GridEvidence[] = [];
  for (const grid of grids) {
    const { cutsX, cutsY } = cutsOf(image, grid);
    const columns = cutsX.length - 1,
      rows = cutsY.length - 1;
    if (Math.min(columns, rows) < MIN_CELLS || Math.max(columns, rows) > MAX_RECOVERED_GRID_SIZE)
      continue;
    const key = keyOf(cutsX, cutsY);
    if (seen.has(key)) continue;
    seen.add(key);
    const { cuts, length, twin, chance } = readingOf(strips, described, grid, cutsX, cutsY);
    readings.push({
      grid: {
        ...grid,
        width: columns,
        height: rows,
        cutsX: [...cuts.cutsX],
        cutsY: [...cuts.cutsY],
      },
      length,
      twin,
      chance,
    });
  }
  return { readings, pixels: pixelLength(described) };
}

/**
 * The best-scoring grid among the proposals, or null when the passthrough scores lower. The
 * winner's confidence is the larger of its proposer's and the share of its twin's length that
 * its phase saves.
 */
export function arbitrateGrids(
  image: PixelBuffer,
  grids: readonly PixelGridAnalysis[],
): ArbitratedGrid | null {
  const { readings, pixels } = gridEvidence(image, grids);
  let passthrough = pixels;
  let best: GridEvidence | null = null;
  for (const reading of readings) {
    passthrough = Math.min(passthrough, Math.max(reading.length, reading.twin));
    if (!best || phaseScore(reading) < phaseScore(best)) best = reading;
  }
  if (!best) return null;
  const score = phaseScore(best);
  if (score >= passthrough - NULL_MARGIN) return null;
  const share = Math.max(0, Math.min(1, (best.twin - best.length) / best.twin));
  return {
    grid: { ...best.grid, confidence: Math.max(best.grid.confidence, share), reliable: true },
    length: best.length,
    score,
  };
}
