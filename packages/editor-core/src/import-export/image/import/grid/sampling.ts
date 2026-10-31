import type { PixelBuffer } from "$/base/primitives";
import { straighten } from "$/import-export/image/import/prepass/deskew";
import {
  PixelGridSamplingAxis,
  type PixelGridAnalysis,
  type PixelGridSamplingStage,
} from "$/import-export/image/import/types";

const STRIDE = 4;
/** Retain Auto's existing confidence gate for local correction during coloring. */
const SAMPLING_MIN_CONFIDENCE = 0.35;
/** Bounded coordinate metadata, with no corrected RGBA allocation. */
const MAX_SHIFT_LOOKUP_ENTRIES = 1 << 18;
const MAX_INT32_COORDINATE = 2 ** 31 - 1;

/** Internal image view. Its data stays in the source; only offset reads apply local shifts. */
export interface GridImageView extends PixelBuffer {
  offset?: (x: number, y: number) => number;
  sampling?: readonly PixelGridSamplingStage[];
}

/** Integer coordinates take the last interval starting at or before them, including ties. */
function axisIndex(boundaries: readonly number[], length: number): Int32Array {
  const index = new Int32Array(length);
  for (let band = 1; band + 1 < boundaries.length; band++)
    index.fill(
      band,
      Math.max(0, Math.ceil(boundaries[band])),
      band + 2 === boundaries.length ? length : Math.max(0, Math.ceil(boundaries[band + 1])),
    );
  return index;
}

/** Compose inverse steps in reverse order, keeping clamping at each intermediate image. */
export function shiftedGridImage(
  image: GridImageView,
  stage: PixelGridSamplingStage,
): GridImageView {
  const { width, height, data } = image;
  const vertical = stage.axis === PixelGridSamplingAxis.Vertical;
  const bands = axisIndex(stage.bands, vertical ? height : width);
  const across = axisIndex(stage.across, vertical ? width : height);
  const previous = image.offset;
  const shifts = stage.shifts;
  let offset: (x: number, y: number) => number;
  if (vertical) {
    offset = previous
      ? (x, y) => previous(x, Math.max(0, Math.min(height - 1, y + shifts[bands[y]][across[x]])))
      : (x, y) =>
          (Math.max(0, Math.min(height - 1, y + shifts[bands[y]][across[x]])) * width + x) * STRIDE;
  } else {
    offset = previous
      ? (x, y) => previous(Math.max(0, Math.min(width - 1, x + shifts[bands[x]][across[y]])), y)
      : (x, y) =>
          (y * width + Math.max(0, Math.min(width - 1, x + shifts[bands[x]][across[y]]))) * STRIDE;
  }
  const length = vertical ? height : width;
  const perpendicular = vertical ? width : height;
  const intervals = stage.across.length - 1;
  // Keep original reads for fractional/non-index coordinates and unsupported shift inputs.
  const original = offset;
  const matrixValid =
    stage.bands.length >= 2 &&
    stage.across.length >= 2 &&
    Array.isArray(stage.shifts) &&
    stage.shifts.length === stage.bands.length - 1 &&
    Array.from(stage.shifts).every((row) => row?.length === intervals);
  if (
    matrixValid &&
    Number.isSafeInteger(length) &&
    length <= MAX_INT32_COORDINATE &&
    Number.isSafeInteger(perpendicular) &&
    length + 2 * stage.shifts.length + 2 * perpendicular + intervals <= MAX_SHIFT_LOOKUP_ENTRIES
  ) {
    const ids = new Int32Array(intervals);
    const bySignature = new Map<string, number>();
    const patterns: number[][] = [];
    let valid = true;
    for (let k = 0; k < intervals; k++) {
      const pattern = stage.shifts.map((row) => row[k]);
      if (!pattern.every(Number.isSafeInteger)) {
        valid = false;
        break;
      }
      const signature = pattern.join(",");
      let id = bySignature.get(signature);
      if (id === undefined) {
        if (
          (patterns.length + 1) * (length + 2 * pattern.length) + 2 * perpendicular + intervals >
          MAX_SHIFT_LOOKUP_ENTRIES
        ) {
          valid = false;
          break;
        }
        id = patterns.length;
        bySignature.set(signature, id);
        patterns.push(pattern);
      }
      ids[k] = id;
    }
    if (valid) {
      const maps = patterns.map((pattern) => {
        const coordinates = new Int32Array(length);
        for (let p = 0; p < length; p++)
          coordinates[p] = Math.max(0, Math.min(length - 1, p + pattern[bands[p]]));
        return coordinates;
      });
      const byLine = Array.from({ length: perpendicular }, (_, p) => maps[ids[across[p]]]);
      if (vertical) {
        offset = previous
          ? (x, y) => {
              const at = byLine[x]?.[y];
              return at === undefined ? original(x, y) : previous(x, at);
            }
          : (x, y) => {
              const at = byLine[x]?.[y];
              return at === undefined ? original(x, y) : (at * width + x) * STRIDE;
            };
      } else {
        offset = previous
          ? (x, y) => {
              const at = byLine[y]?.[x];
              return at === undefined ? original(x, y) : previous(at, y);
            }
          : (x, y) => {
              const at = byLine[y]?.[x];
              return at === undefined ? original(x, y) : (y * width + at) * STRIDE;
            };
      }
    }
  }
  return { width, height, data, sampling: [...(image.sampling ?? []), stage], offset };
}

/** Materialize only when a consumer needs a regular RGBA buffer, such as final coloring. */
export function materializeGridImage(image: GridImageView): PixelBuffer {
  const offset = image.offset;
  if (!offset) return image;
  const data = new Uint8ClampedArray(image.width * image.height * STRIDE);
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const from = offset(x, y);
      const to = (y * image.width + x) * STRIDE;
      for (let channel = 0; channel < STRIDE; channel++)
        data[to + channel] = image.data[from + channel];
    }
  return { width: image.width, height: image.height, data };
}

/** Use the same rotation and local inverse mapping selected by Auto during final recovery. */
export function prepareGridSampling(image: PixelBuffer, grid: PixelGridAnalysis): PixelBuffer {
  const upright = grid.rotation ? straighten(image, grid.rotation) : image;
  if (!grid.sampling?.length || grid.confidence < SAMPLING_MIN_CONFIDENCE) return upright;
  let view: GridImageView = upright;
  for (const stage of grid.sampling) view = shiftedGridImage(view, stage);
  return materializeGridImage(view);
}
