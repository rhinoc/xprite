import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { assertPixelBuffer } from "$/document/pixel-validation";
import type { PixelGridAnalysis, PixelGridGeometry } from "$/import-export/image/import/types";

const CHANNELS = 4;
const SCANLINES = 48;
const MIN_CELLS = 4;
export const MAX_RECOVERED_GRID_SIZE = 512;
export const MAX_GRID_CELL_SIZE = 128;
const MIN_CELL_SIZE = 2;
const EDGE_THRESHOLD = 12 / UINT8_MAX;
const PEAK_MEAN_MULTIPLIER = 1.8;
const PEAK_MAX_FRACTION = 0.16;
const MAX_PEAKS = 192;
const MIN_PEAKS = 5;
const MIN_AXIS_CONFIDENCE = 0.64;
const HIGH_COHERENCE_THRESHOLD = 0.9;
const MIN_UNIFORMITY = 0.72;
const MIN_RUN_FRACTION = 0.015;
const AXIS_CANDIDATES = 12;
const PIXEL_CENTER_OFFSET = 0.5;
const PHASE_SNAP = 0.2;
const PHASE_WEIGHT = 0.65;
const RUN_WEIGHT = 0.2;
const SINGLE_RUN_WEIGHT = 0.15;
const SINGLE_RUN_SCALE = 3;
const RUN_TOLERANCE_FRACTION = 0.25;
const MIN_RUN_TOLERANCE = 0.6;
const FULL_TURN = Math.PI * 2;
const UNIFORMITY_SAMPLES = 256;
const UNIFORMITY_SCALE = 20;
const CORNER_FRACTIONS = [0.3, 0.7] as const;
const REFINEMENT_STEP = 0.002;
const REFINEMENT_RANGE = 0.5;
interface Axis {
  step: number;
  offset: number;
  confidence: number;
}
interface Peak {
  position: number;
  weight: number;
}
function colorDifference(image: PixelBuffer, first: number, second: number): number {
  const a = image.data[first + 3] / UINT8_MAX,
    b = image.data[second + 3] / UINT8_MAX;
  let difference = Math.abs(a - b);
  for (let c = 0; c < CHANNELS - 1; c++)
    difference = Math.max(
      difference,
      Math.abs(image.data[first + c] * a - image.data[second + c] * b) / UINT8_MAX,
    );
  return difference;
}
function scanAxis(image: PixelBuffer, horizontal: boolean): Axis[] {
  const length = horizontal ? image.width : image.height;
  const cross = horizontal ? image.height : image.width;
  const profile = new Float64Array(length);
  const runs = new Float64Array(MAX_GRID_CELL_SIZE + 1);
  let runCount = 0;
  const lines = Math.min(SCANLINES, cross);

  // Scan and accumulate edge profile
  for (let line = 0; line < lines; line++) {
    const row = Math.min(cross - 1, Math.floor(((line + 0.5) * cross) / lines));
    for (let position = 1; position < length; position++) {
      const first =
        (horizontal ? row * image.width + position - 1 : (position - 1) * image.width + row) *
        CHANNELS;
      const second = first + (horizontal ? CHANNELS : image.width * CHANNELS);
      const difference = colorDifference(image, first, second);
      profile[position] += difference;
    }
  }

  let total = 0,
    maximum = 0;
  for (const value of profile) {
    total += value;
    maximum = Math.max(maximum, value);
  }
  const threshold = Math.max((total / length) * PEAK_MEAN_MULTIPLIER, maximum * PEAK_MAX_FRACTION);

  // Merge consecutive over-threshold edges into weighted centers
  const mergedPeaks: Peak[] = [];
  let edgeStart = -1;
  let edgeWeight = 0;
  let edgeWeightedSum = 0;

  for (let i = 0; i < length; i++) {
    if (profile[i] >= EDGE_THRESHOLD) {
      if (edgeStart === -1) edgeStart = i;
      edgeWeight += profile[i];
      edgeWeightedSum += profile[i] * i;
    } else if (edgeStart !== -1) {
      // End of edge run, compute weighted center
      const center = edgeWeightedSum / edgeWeight;
      if (edgeWeight >= threshold) {
        mergedPeaks.push({ position: center, weight: edgeWeight });
      }
      // Measure run distance for merged edges
      if (mergedPeaks.length >= 2) {
        const distance = Math.round(center - mergedPeaks[mergedPeaks.length - 2].position);
        if (distance > 0 && distance <= MAX_GRID_CELL_SIZE) {
          runs[distance]++;
          runCount++;
        }
      }
      edgeStart = -1;
      edgeWeight = 0;
      edgeWeightedSum = 0;
    }
  }
  // Handle edge at end
  if (edgeStart !== -1) {
    const center = edgeWeightedSum / edgeWeight;
    if (edgeWeight >= threshold) {
      mergedPeaks.push({ position: center, weight: edgeWeight });
      if (mergedPeaks.length >= 2) {
        const distance = Math.round(center - mergedPeaks[mergedPeaks.length - 2].position);
        if (distance > 0 && distance <= MAX_GRID_CELL_SIZE) {
          runs[distance]++;
          runCount++;
        }
      }
    }
  }

  if (mergedPeaks.length < MIN_PEAKS || !runCount) return [{ step: 1, offset: 0, confidence: 0 }];

  const strong = mergedPeaks
    .sort((a, b) => b.weight - a.weight || a.position - b.position)
    .slice(0, MAX_PEAKS);

  // Generate integer candidates
  const candidates = new Set<number>();
  for (let cells = MIN_CELLS; cells <= MAX_RECOVERED_GRID_SIZE; cells++) {
    const step = length / cells;
    if (step >= MIN_CELL_SIZE && step <= MAX_GRID_CELL_SIZE) candidates.add(step);
  }
  for (let step = MIN_CELL_SIZE; step <= Math.min(MAX_GRID_CELL_SIZE, length / MIN_CELLS); step++)
    candidates.add(step);

  const ranked: Axis[] = [];

  for (const baseStep of candidates) {
    // Evaluate base step
    const { coherence, offset: baseOffset } = evaluateStep(strong, baseStep);

    // Fine refinement around best candidate if coherence is promising
    let bestStep = baseStep;
    let bestCoherence = coherence;
    let bestOffset = baseOffset;

    if (coherence > 0.7) {
      const minStep = Math.max(MIN_CELL_SIZE, baseStep - REFINEMENT_RANGE);
      const maxStep = Math.min(MAX_GRID_CELL_SIZE, baseStep + REFINEMENT_RANGE);
      for (let refinedStep = minStep; refinedStep <= maxStep; refinedStep += REFINEMENT_STEP) {
        const refined = evaluateStep(strong, refinedStep);
        if (refined.coherence > bestCoherence) {
          bestStep = refinedStep;
          bestCoherence = refined.coherence;
          bestOffset = refined.offset;
        }
      }
    }

    // Compute run-based confidence components
    let comb = 0,
      single = 0;
    const tolerance = Math.max(MIN_RUN_TOLERANCE, bestStep * RUN_TOLERANCE_FRACTION);
    for (let run = 1; run < runs.length; run++) {
      if (!runs[run]) continue;
      const multiple = Math.max(1, Math.round(run / bestStep));
      comb += runs[run] * Math.max(0, 1 - Math.abs(run - multiple * bestStep) / tolerance);
      single += runs[run] * Math.max(0, 1 - Math.abs(run - bestStep) / tolerance);
    }
    const runSupport = single / runCount;

    // Accept axis if high coherence and peaks cluster, or meet minimum run fraction
    const acceptByCoherence = bestCoherence >= HIGH_COHERENCE_THRESHOLD;
    const acceptByRuns = runSupport >= MIN_RUN_FRACTION;

    if (!acceptByCoherence && !acceptByRuns) continue;

    const confidence =
      bestCoherence * bestCoherence * PHASE_WEIGHT +
      (comb / runCount) * RUN_WEIGHT +
      Math.min(1, runSupport * SINGLE_RUN_SCALE) * SINGLE_RUN_WEIGHT;

    ranked.push({ step: bestStep, offset: bestOffset, confidence });
  }

  return ranked.length
    ? ranked
        .sort((a, b) => b.confidence - a.confidence || a.step - b.step)
        .slice(0, AXIS_CANDIDATES)
    : [{ step: 1, offset: 0, confidence: 0 }];
}

function evaluateStep(peaks: readonly Peak[], step: number): { coherence: number; offset: number } {
  let sine = 0,
    cosine = 0,
    weight = 0;
  for (const peak of peaks) {
    const angle = (peak.position * FULL_TURN) / step;
    sine += Math.sin(angle) * peak.weight;
    cosine += Math.cos(angle) * peak.weight;
    weight += peak.weight;
  }
  const coherence = Math.hypot(sine, cosine) / weight;
  let offset = ((((Math.atan2(sine, cosine) / FULL_TURN) * step) % step) + step) % step;
  if (offset < PHASE_SNAP || step - offset < PHASE_SNAP) offset = 0;
  return { coherence, offset };
}
export function pixelGridCuts(length: number, step: number, offset = 0): number[] {
  if (!Number.isFinite(step) || step < 1 || !Number.isFinite(offset))
    throw new RangeError("Grid cells must be at least one pixel wide.");
  const phase = ((offset % step) + step) % step;
  const cuts = [0];
  let position = phase > PHASE_SNAP ? phase : step;
  for (; position < length - PHASE_SNAP; position += step) {
    // Quantize one regular lattice to raster edges; never chase individual content edges.
    const cut = Math.max(0, Math.min(length, Math.ceil(position - PIXEL_CENTER_OFFSET)));
    if (cut > cuts[cuts.length - 1] && cut < length) cuts.push(cut);
  }
  cuts.push(length);
  return cuts;
}
export function manualPixelGrid(
  image: Pick<PixelBuffer, "width" | "height">,
  cellWidth: number,
  cellHeight: number,
): PixelGridGeometry {
  if (cellWidth > MAX_GRID_CELL_SIZE || cellHeight > MAX_GRID_CELL_SIZE)
    throw new RangeError("Choose cell sizes no larger than 128 pixels.");
  const width = pixelGridCuts(image.width, cellWidth).length - 1,
    height = pixelGridCuts(image.height, cellHeight).length - 1;
  if (width > MAX_RECOVERED_GRID_SIZE || height > MAX_RECOVERED_GRID_SIZE)
    throw new RangeError("Choose larger cells to restore this image.");
  return { width, height, cellWidth, cellHeight, offsetX: 0, offsetY: 0 };
}
function uniformity(
  image: PixelBuffer,
  xCuts: readonly number[],
  yCuts: readonly number[],
): number {
  const width = xCuts.length - 1,
    height = yCuts.length - 1;
  const samples = Math.min(UNIFORMITY_SAMPLES, width * height);
  let difference = 0,
    measured = 0;
  for (let i = 0; i < samples; i++) {
    const index = Math.min(width * height - 1, Math.floor(((i + 0.5) * width * height) / samples));
    const x = index % width,
      y = Math.floor(index / width);
    const offsets: number[] = [];
    for (const fy of CORNER_FRACTIONS)
      for (const fx of CORNER_FRACTIONS) {
        const sx = Math.min(image.width - 1, Math.floor(xCuts[x] + (xCuts[x + 1] - xCuts[x]) * fx));
        const sy = Math.min(
          image.height - 1,
          Math.floor(yCuts[y] + (yCuts[y + 1] - yCuts[y]) * fy),
        );
        offsets.push((sy * image.width + sx) * CHANNELS);
      }
    for (let j = 1; j < offsets.length; j++) {
      difference += colorDifference(image, offsets[0], offsets[j]);
      measured++;
    }
  }
  return Math.exp((-UNIFORMITY_SCALE * difference) / Math.max(1, measured));
}
/** Conservative agreement of projected edge phase, scanline run lengths and cell homogeneity. */
export function detectPixelGrid(image: PixelBuffer): PixelGridAnalysis {
  assertPixelBuffer(image);
  const horizontal = scanAxis(image, true),
    vertical = scanAxis(image, false);
  let best: PixelGridAnalysis | undefined;
  for (const x of horizontal)
    for (const y of vertical) {
      const xCuts = pixelGridCuts(image.width, x.step, x.offset),
        yCuts = pixelGridCuts(image.height, y.step, y.offset);
      const width = xCuts.length - 1,
        height = yCuts.length - 1;
      const eligible =
        x.step >= MIN_CELL_SIZE &&
        y.step >= MIN_CELL_SIZE &&
        x.confidence >= MIN_AXIS_CONFIDENCE &&
        y.confidence >= MIN_AXIS_CONFIDENCE &&
        width <= MAX_RECOVERED_GRID_SIZE &&
        height <= MAX_RECOVERED_GRID_SIZE;
      if (best?.reliable && !eligible) continue;
      const flatness = uniformity(image, xCuts, yCuts);
      const confidence = Math.min(x.confidence, y.confidence) * flatness;
      const reliable = eligible && flatness >= MIN_UNIFORMITY;
      if (best && (!reliable || best.reliable) && confidence <= best.confidence) continue;
      if (best?.reliable && !reliable) continue;
      best = {
        width,
        height,
        cellWidth: x.step,
        cellHeight: y.step,
        offsetX: x.offset,
        offsetY: y.offset,
        confidence,
        reliable,
      };
    }
  return best!;
}
