/**
 * Grid arbitration via description-length (MDL).
 *
 * GridEvidenceReader shares the image description, line prefixes and distinct readings across
 * arbitration, corroboration and consensus selection for one evaluation view.
 */

import type { PixelBuffer } from "$/base/primitives";
import {
  CutModel,
  describeImage,
  descriptionLength,
  pixelLength,
  type DescribedImage,
  type GridCuts,
} from "$/import-export/image/import/grid/arbitrate/description-length";
import {
  fieldChanceEvidence,
  phaseField,
} from "$/import-export/image/import/grid/arbitrate/phase-field";
import {
  chanceEvidence,
  StripImage,
  stripShear,
  type ChanceEvidenceFragments,
  type ChanceEvidenceStop,
  type StripShear,
} from "$/import-export/image/import/grid/arbitrate/strip-shift";
import { snapLatticeCuts } from "$/import-export/image/import/grid/detect/cut-snap";
import { MAX_RECOVERED_GRID_SIZE, pixelGridCuts } from "$/import-export/image/import/grid/lattice";
import {
  PixelationAlgorithm,
  type PixelGridAnalysis,
  type PixelGridSamplingStage,
} from "$/import-export/image/import/types";

/**
 * One decision over every proposed grid and the passthrough. Each proposal is read in the ways
 * its cuts allow, and the reading that scores best stands: an edge mesh as placed; a lattice as
 * cut or with its cuts snapped to the nearest edges (leaving every cut in place is one of the
 * snaps, so the offsets have to pay for themselves); and either of them through strip shifts (see
 * grid-strip-shift) or a phase field (see grid-phase-field), described on the straightened image
 * and paying for the shifts. Every reading carries three numbers:
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
 * - the best length any proposal reaches at the worse of its two phases, less the phase evidence
 *   its search finds by chance: what a lattice explains whatever its phase (smooth photos and
 *   gradients), or with shifts that find a phase on any content, is no evidence of a grid.
 *
 * Phase evidence has to come from every cut, which also settles octaves. Split a reading's cuts
 * into OCTAVE_CLASSES (every second cut, every third cut) and moving one class to the cell
 * middles should lose about its share of the twin's evidence. A finer octave of a coarser grid,
 * such as a lattice at half the pitch of a textured upscale, has a class inside the coarser
 * cells, which moves for free: the shortfall of the least evident class from its share is
 * evidence the reading does not own, and it adds to the reading's score.
 *
 * Geometries are admitted by the strongest proposal's confidence; every cut model for an
 * admitted geometry competes on the same score, independently of its proposer's confidence.
 */
const PHASE_EVIDENCE_WEIGHT = 1.1;
/** Nats per sample the passthrough is preferred by. */
const NULL_MARGIN = 0.03;
/**
 * Cells per axis a grid needs: with fewer, a few large features can line up with the cuts by
 * chance and pass for phase evidence.
 */
const MIN_CELLS = 8;
const STRONG_GRID_CONFIDENCE = 0.9;
const DISTINCT_GEOMETRY_CONFIDENCE_GAP = 0.5;
/** Every how many cuts the octave classes take. */
const OCTAVE_CLASSES = [2, 3] as const;
const HALF = 0.5;

/** A grid reading: the hypothesis with its cuts, its length and its twin's, per sample. */
export interface GridEvidence {
  grid: PixelGridAnalysis;
  length: number;
  twin: number;
  /** Phase evidence, per sample, the reading's strip search finds by chance. */
  chance: number;
  /** The image the reading describes: the input, or its straightened strips. */
  frame: () => DescribedImage;
}

export interface ArbitratedGrid {
  grid: PixelGridAnalysis;
  /** Description length per sample, in nats. */
  length: number;
  /** The decision's score, per sample; lower is better. */
  score: number;
}

export const phaseScore = (reading: Pick<GridEvidence, "length" | "twin" | "chance">) =>
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

/** The cuts with every `period`th inner cut, from the `phase`th, moved to its cell's middle. */
export function classTwinCuts(cuts: readonly number[], period: number, phase: number): number[] {
  const twin = [...cuts];
  const cells = cuts.length - 1;
  for (let i = 1; i < cells; i++)
    if (i % period === phase) twin[i] = Math.round((cuts[i] + cuts[i + 1]) * HALF);
  for (let i = 1; i <= cells; i++) if (twin[i] <= twin[i - 1]) twin[i] = twin[i - 1] + 1;
  return twin;
}

/** Phase evidence, per sample, the reading's cuts miss from their least evident class. */
export function octaveShortfall(
  frame: DescribedImage,
  cutsX: readonly number[],
  cutsY: readonly number[],
): number {
  const length = (x: readonly number[], y: readonly number[]) =>
    descriptionLength(frame, { cutsX: x, cutsY: y, model: CutModel.Lattice });
  const own = length(cutsX, cutsY);
  const evidence = length(twinCuts(cutsX), twinCuts(cutsY)) - own;
  let shortfall = 0;
  for (const period of OCTAVE_CLASSES) {
    let least = Infinity;
    for (let phase = 0; phase < period; phase++)
      least = Math.min(
        least,
        length(classTwinCuts(cutsX, period, phase), classTwinCuts(cutsY, period, phase)) - own,
      );
    shortfall = Math.max(shortfall, evidence - period * least);
  }
  return shortfall;
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
  frame: () => DescribedImage;
  /** Compact inverse steps into the full source, independent of the scoring crop. */
  sampling?: readonly PixelGridSamplingStage[];
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

interface ShiftedReading {
  shear: StripShear;
  frame: () => DescribedImage;
  twin: () => DescribedImage;
  chance: (stopIfCannotWin?: ChanceEvidenceStop) => number;
}

/** The correction search and sampled colors depend on geometry, independently of the cut model. */
function shiftedReadings(
  strips: StripImage,
  cutsX: number[],
  cutsY: number[],
): readonly ShiftedReading[] {
  const field = phaseField(strips, cutsX, cutsY);
  const shifted: {
    shear: StripShear | null;
    chance: (stopIfCannotWin?: ChanceEvidenceStop, fragments?: ChanceEvidenceFragments) => number;
  }[] = [
    {
      shear: stripShear(strips, cutsX, cutsY),
      chance: (stop, fragments) => chanceEvidence(strips, cutsX, cutsY, stop, fragments),
    },
    {
      shear: field,
      chance: (stop, fragments) =>
        fieldChanceEvidence(strips, cutsX, cutsY, field!.bandsX, field!.bandsY, stop, fragments),
    },
  ];
  return shifted.flatMap(({ shear, chance }) => {
    if (!shear) return [];
    let frame: DescribedImage | undefined,
      twin: DescribedImage | undefined,
      evidence: number | undefined,
      fragments: ChanceEvidenceFragments | undefined;
    return [
      {
        shear,
        frame: () => (frame ??= describeImage(shear.straight)),
        twin: () => (twin ??= describeImage(shear.twin())),
        chance: (stop) => {
          if (evidence !== undefined) return evidence;
          const measured = chance(stop, (fragments ??= []));
          // A stopped measurement is not a reusable exact value for another cut model.
          if (measured !== Infinity) evidence = measured;
          return measured;
        },
      },
    ];
  });
}

function readingOf(
  strips: StripImage,
  described: DescribedImage,
  grid: PixelGridAnalysis,
  cutsX: number[],
  cutsY: number[],
  shifted: () => readonly ShiftedReading[],
): Reading {
  const placed = placedReading(strips.image, described, grid, cutsX, cutsY);
  let best: Reading = {
    cuts: placed.cuts,
    length: placed.length,
    twin: descriptionLength(described, placed.twin()),
    chance: 0,
    frame: () => described,
    sampling: strips.image.sampling,
  };
  const cuts = {
    cutsX,
    cutsY,
    model: grid.algorithm === PixelationAlgorithm.EdgeGrid ? CutModel.Free : CutModel.Lattice,
  };
  for (const { shear, frame, twin, chance } of shifted()) {
    const straight = frame();
    const cost = shear.cost / straight.samples;
    const reading: Reading = {
      cuts,
      length: descriptionLength(straight, cuts) + cost,
      twin: descriptionLength(twin(), cuts) + cost,
      chance: 0,
      frame,
      sampling: shear.straight.sampling,
    };
    // Chance evidence only adds to a score, so it is measured only for a reading that could win.
    const optimistic = phaseScore(reading),
      incumbent = phaseScore(best);
    if (optimistic >= incumbent) continue;
    const canBound =
      Number.isFinite(reading.length) &&
      Number.isFinite(reading.twin) &&
      Number.isFinite(optimistic) &&
      Number.isFinite(incumbent);
    reading.chance = chance(
      canBound
        ? (lowerBound) =>
            phaseScore({ length: reading.length, twin: reading.twin, chance: lowerBound }) >=
            incumbent
        : undefined,
    );
    if (phaseScore(reading) < incumbent) best = reading;
  }
  return best;
}

/** Reuse one evaluation view's descriptions and distinct readings during Auto's decision. */
export class GridEvidenceReader {
  private readonly described: DescribedImage;
  private readonly strips: StripImage;
  private readonly pixels: number;
  private readonly readings = new Map<string, Reading>();

  constructor(private readonly image: PixelBuffer) {
    this.described = describeImage(image);
    this.strips = new StripImage(image);
    this.pixels = pixelLength(this.described);
  }

  read(grids: readonly PixelGridAnalysis[]): { readings: GridEvidence[]; pixels: number } {
    const { image, described, strips } = this;
    const seen = new Set<string>();
    const readings: GridEvidence[] = [];
    // Admission is scoped to geometry; every model of admitted cuts is evaluated.
    const ordered = grids
      .map((grid) => {
        const { cutsX, cutsY } = cutsOf(image, grid);
        const model =
          grid.algorithm === PixelationAlgorithm.EdgeGrid ? CutModel.Free : CutModel.Lattice;
        const geometry = keyOf(cutsX, cutsY);
        return { grid, cutsX, cutsY, geometry, key: `${model}:${geometry}` };
      })
      .sort(
        (a, b) =>
          b.grid.confidence - a.grid.confidence ||
          a.key.localeCompare(b.key) ||
          (a.grid.algorithm ?? "").localeCompare(b.grid.algorithm ?? "") ||
          a.grid.cellWidth - b.grid.cellWidth ||
          a.grid.cellHeight - b.grid.cellHeight ||
          a.grid.offsetX - b.grid.offsetX ||
          a.grid.offsetY - b.grid.offsetY,
      );
    // Only pending models of the same geometry need shared auxiliary descriptions. Release
    // those once both models are read; persistent readings retain only their winning frame.
    const pending = new Map<string, Set<string>>();
    const corrections = new Map<string, readonly ShiftedReading[]>();
    for (const { geometry, key } of ordered) {
      if (this.readings.has(key)) continue;
      const models = pending.get(geometry) ?? new Set<string>();
      models.add(key);
      pending.set(geometry, models);
    }
    const admittedGeometries = new Set<string>();
    let bestConfidence = -Infinity;
    for (const { grid, cutsX, cutsY, geometry, key } of ordered) {
      const columns = cutsX.length - 1,
        rows = cutsY.length - 1;
      if (Math.min(columns, rows) < MIN_CELLS || Math.max(columns, rows) > MAX_RECOVERED_GRID_SIZE)
        continue;
      if (seen.has(key)) continue;
      seen.add(key);
      if (
        !admittedGeometries.has(geometry) &&
        readings.length > 0 &&
        bestConfidence >= STRONG_GRID_CONFIDENCE &&
        bestConfidence - grid.confidence >= DISTINCT_GEOMETRY_CONFIDENCE_GAP
      )
        continue;
      admittedGeometries.add(geometry);
      let reading = this.readings.get(key);
      if (!reading) {
        reading = readingOf(strips, described, grid, cutsX, cutsY, () => {
          let shifted = corrections.get(geometry);
          if (!shifted) {
            shifted = shiftedReadings(strips, cutsX, cutsY);
            if (pending.get(geometry)!.size > 1) corrections.set(geometry, shifted);
          }
          return shifted;
        });
        this.readings.set(key, reading);
        const models = pending.get(geometry)!;
        models.delete(key);
        if (!models.size) corrections.delete(geometry);
      }
      const { cuts, length, twin, chance, frame, sampling } = reading;
      readings.push({
        grid: {
          ...grid,
          width: columns,
          height: rows,
          cutsX: [...cuts.cutsX],
          cutsY: [...cuts.cutsY],
          sampling,
        },
        length,
        twin,
        chance,
        frame,
      });
      bestConfidence = Math.max(bestConfidence, grid.confidence);
    }
    return { readings, pixels: this.pixels };
  }
}

/**
 * The best-scoring grid among the proposals, or null when the passthrough scores lower. The
 * winner's confidence is the larger of its proposer's and the share of its twin's length that
 * its phase saves.
 */
export function arbitrateGrids(
  image: PixelBuffer,
  grids: readonly PixelGridAnalysis[],
  evidence = new GridEvidenceReader(image),
): ArbitratedGrid | null {
  const { readings, pixels } = evidence.read(grids);
  let passthrough = pixels;
  for (const reading of readings)
    passthrough = Math.min(passthrough, Math.max(reading.length, reading.twin - reading.chance));
  let best: GridEvidence | null = null;
  let score = passthrough - NULL_MARGIN;
  // The octave shortfall only adds to a score, so readings are checked best phase score first
  // and the search stops at the first that cannot win even without it.
  for (const reading of [...readings].sort((a, b) => phaseScore(a) - phaseScore(b))) {
    const phase = phaseScore(reading);
    if (phase >= score) break;
    const { cutsX, cutsY } = reading.grid;
    const total = phase + octaveShortfall(reading.frame(), cutsX!, cutsY!);
    if (total < score) {
      best = reading;
      score = total;
    }
  }
  if (!best) return null;
  const share = Math.max(0, Math.min(1, (best.twin - best.length) / best.twin));
  return {
    grid: { ...best.grid, confidence: Math.max(best.grid.confidence, share), reliable: true },
    length: best.length,
    score,
  };
}
