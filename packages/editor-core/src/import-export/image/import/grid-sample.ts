import type { PixelBuffer } from "$/base/primitives";
import { getColorPickerEntry } from "$/import-export/image/import/cell-color-picker";
import { MAX_RECOVERED_GRID_SIZE, pixelGridCuts } from "$/import-export/image/import/grid";
import { samplePixelation } from "$/import-export/image/import/sampling";
import {
  CellColorPicker,
  PixelationMethod,
  type PixelGridGeometry,
} from "$/import-export/image/import/types";
const CHANNELS = 4;
const COLOR_CHANNELS = 3;

interface PixelCells {
  x: Int32Array;
  y: Int32Array;
}

/** Integer pixel positions inside each half-open cut interval; uncovered positions keep cell 0. */
function pixelCells(length: number, cuts: readonly number[]): Int32Array {
  const cells = new Int32Array(length);
  // Earlier intervals win, as in the original first-match search. For ordered cuts the fills
  // touch each pixel at most once, including when a boundary falls between two pixel positions.
  for (let cell = cuts.length - 2; cell >= 0; cell--) {
    const first = Math.max(0, Math.ceil(cuts[cell]));
    const end = Math.min(length, Math.ceil(cuts[cell + 1]));
    if (end > first) cells.fill(cell, first, end);
  }
  return cells;
}

/**
 * Round-trip error: upscale candidate grid back to input size via nearest-neighbor,
 * compute mean RGB Euclidean distance on opaque input pixels.
 * Lower score means better fidelity.
 */
function roundTripError(input: PixelBuffer, candidate: PixelBuffer, cells: PixelCells): number {
  let errorSum = 0;
  let pixelCount = 0;

  for (let y = 0; y < input.height; y++) {
    for (let x = 0; x < input.width; x++) {
      const inputOffset = (y * input.width + x) * CHANNELS;
      const alpha = input.data[inputOffset + COLOR_CHANNELS];
      if (alpha === 0) continue; // Skip transparent pixels

      const candOffset = (cells.y[y] * candidate.width + cells.x[x]) * CHANNELS;
      let colorError = 0;
      for (let c = 0; c < COLOR_CHANNELS; c++) {
        const diff = input.data[inputOffset + c] - candidate.data[candOffset + c];
        colorError += diff * diff;
      }
      errorSum += Math.sqrt(colorError);
      pixelCount++;
    }
  }

  return pixelCount > 0 ? errorSum / pixelCount : 0;
}

/**
 * Pixel art is drawn with whole pixels: a cell is either covered or clear. A generated or resampled
 * sprite carries a soft edge instead: the pixels along its outline are partly transparent, and its
 * covered pixels often sit a little below full opacity. Averaged into cells, that leaves a
 * half-transparent ring around the recovered sprite and an almost-opaque inside.
 *
 * A cell that holds both covered pixels (alpha of at least HALF_ALPHA) and uncovered ones lies on
 * the outline. It is in the art when its covered pixels fill at least half of it, and clear
 * otherwise; in opaque art, so is a cell with no covered pixel. A covered cell takes the mean alpha of its covered pixels, raised to OPAQUE when the
 * source's art is opaque: at most TRANSLUCENT_SHARE of its visible pixels between TRANSLUCENT_LOW
 * and TRANSLUCENT_HIGH. Art drawn translucent (glass, shadows, glow) keeps its alpha.
 */
const HALF_ALPHA = 128;
const HALF = 0.5;
const OPAQUE = 255;
const TRANSLUCENT_LOW = 16;
const TRANSLUCENT_HIGH = 224;
/** Share of the visible pixels a soft outline around opaque art stays below. */
const TRANSLUCENT_SHARE = 0.2;

/** Whether the image's visible pixels are opaque but for a soft edge. */
function opaqueArt(image: PixelBuffer): boolean {
  let visible = 0,
    translucent = 0;
  for (let o = COLOR_CHANNELS; o < image.data.length; o += CHANNELS) {
    const alpha = image.data[o];
    if (!alpha) continue;
    visible++;
    if (alpha >= TRANSLUCENT_LOW && alpha <= TRANSLUCENT_HIGH) translucent++;
  }
  return visible > 0 && translucent <= TRANSLUCENT_SHARE * visible;
}

function settleEdgeAlpha(
  image: PixelBuffer,
  x: readonly number[],
  y: readonly number[],
  out: PixelBuffer,
): void {
  const opaque = opaqueArt(image);
  for (let row = 0; row < out.height; row++)
    for (let column = 0; column < out.width; column++) {
      const offset = (row * out.width + column) * CHANNELS;
      if (!out.data[offset + COLOR_CHANNELS]) continue;
      const left = Math.max(0, Math.ceil(x[column])),
        right = Math.min(image.width, Math.ceil(x[column + 1])),
        top = Math.max(0, Math.ceil(y[row])),
        bottom = Math.min(image.height, Math.ceil(y[row + 1]));
      let covered = 0,
        coveredAlpha = 0;
      for (let py = top; py < bottom; py++)
        for (let px = left; px < right; px++) {
          const alpha = image.data[(py * image.width + px) * CHANNELS + COLOR_CHANNELS];
          if (alpha < HALF_ALPHA) continue;
          covered++;
          coveredAlpha += alpha;
        }
      const area = (right - left) * (bottom - top);
      if (!covered && !opaque) continue;
      if (covered < HALF * area) out.data.fill(0, offset, offset + CHANNELS);
      else if (opaque) out.data[offset + COLOR_CHANNELS] = OPAQUE;
      else if (covered < area)
        out.data[offset + COLOR_CHANNELS] = Math.round(coveredAlpha / covered);
    }
}

/** One RGBA pixel per grid cell: explicit cuts when the grid carries them, else one regular lattice. */
export function recoverGrid(
  image: PixelBuffer,
  grid: PixelGridGeometry,
  picker: CellColorPicker = CellColorPicker.MostCommon,
): PixelBuffer {
  const x = grid.cutsX ?? pixelGridCuts(image.width, grid.cellWidth, grid.offsetX),
    y = grid.cutsY ?? pixelGridCuts(image.height, grid.cellHeight, grid.offsetY);
  const recovered = pickCells(image, grid, picker, x, y);
  settleEdgeAlpha(image, x, y, recovered);
  return recovered;
}

function pickCells(
  image: PixelBuffer,
  grid: PixelGridGeometry,
  picker: CellColorPicker,
  x: readonly number[],
  y: readonly number[],
): PixelBuffer {
  const width = x.length - 1,
    height = y.length - 1;
  if (width > MAX_RECOVERED_GRID_SIZE || height > MAX_RECOVERED_GRID_SIZE)
    throw new RangeError("Choose larger cells to restore this image.");
  if (grid.width !== width || grid.height !== height)
    throw new RangeError("The grid no longer matches this image.");

  // Structure picker: use global palette + label vote + centre-weighted original colour
  if (picker === CellColorPicker.Structure) {
    return samplePixelation(image, width, height, PixelationMethod.Structure, { x, y });
  }

  // TwoStage picker: Fixer-like two-stage packing (adaptive K, pure triangular weights)
  if (picker === CellColorPicker.TwoStage) {
    return samplePixelation(image, width, height, PixelationMethod.TwoStage, { x, y });
  }

  // Dual RT picker: Structure vs TwoStage, winner chosen by round-trip error
  if (picker === CellColorPicker.DualRtTwoStage) {
    const candidateA = samplePixelation(image, width, height, PixelationMethod.Structure, { x, y });
    const candidateB = samplePixelation(image, width, height, PixelationMethod.TwoStage, { x, y });
    const cells = { x: pixelCells(image.width, x), y: pixelCells(image.height, y) };
    const errorA = roundTripError(image, candidateA, cells);
    const errorB = roundTripError(image, candidateB, cells);
    // Lower error wins; tie goes to Structure (A)
    return errorB < errorA ? candidateB : candidateA;
  }

  // Traditional cell-by-cell color picking
  const entry = getColorPickerEntry(picker);
  const data = new Uint8ClampedArray(width * height * CHANNELS);
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++) {
      const color = entry.pick(image, x[column], y[row], x[column + 1], y[row + 1]);
      if (color) data.set(color, (row * width + column) * CHANNELS);
    }
  entry.finish?.(data);
  return { width, height, data };
}
