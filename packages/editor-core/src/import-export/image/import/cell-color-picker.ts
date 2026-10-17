import type { PixelBuffer } from "$/base/primitives";
import { CellColorPicker } from "$/import-export/image/import/types";

/**
 * Per-cell colour choice and output colour merging follow KennethJAllen/proper-pixel-art (MIT):
 * the dominant colour of a cell is the median of the fullest bin of two offset RGB binnings, and
 * near-duplicate output colours then collapse to the most frequent one. No quantise-first step.
 */
const CHANNELS = 4;
const BIN_SIZE = 52;
const BINS = Math.floor(255 / BIN_SIZE) + 1;
const BIN_OFFSET = Math.floor(BIN_SIZE / 2);
const MERGE_DISTANCE = 12;
const MIN_OPAQUE_SHARE = 0.5;

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const mid = values.length >> 1;
  return values.length % 2 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2);
}
/** RGBA of one cell, or null when it is mostly transparent. */
function dominantColor(
  image: PixelBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): [number, number, number, number] | null {
  const pixels: number[] = [];
  let total = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      total++;
      const o = (y * image.width + x) * CHANNELS;
      if (image.data[o + 3] > 0) pixels.push(o);
    }
  if (!total || pixels.length < MIN_OPAQUE_SHARE * total) return null;
  const channel = (list: number[], c: number) => list.map((o) => image.data[o + c]);
  const pick = (list: number[]): [number, number, number, number] => [
    median(channel(list, 0)),
    median(channel(list, 1)),
    median(channel(list, 2)),
    Math.round(channel(list, 3).reduce((a, b) => a + b, 0) / list.length),
  ];
  if (pixels.length <= 3) return pick(pixels);
  const counts = [new Uint32Array(BINS ** 3), new Uint32Array(BINS ** 3)];
  const keys = [new Int32Array(pixels.length), new Int32Array(pixels.length)];
  pixels.forEach((o, i) => {
    for (let grid = 0; grid < 2; grid++) {
      const shift = grid ? BIN_OFFSET : 0;
      const bin = (c: number) => Math.floor(Math.min(255, image.data[o + c] + shift) / BIN_SIZE);
      const key = (bin(0) * BINS + bin(1)) * BINS + bin(2);
      keys[grid][i] = key;
      counts[grid][key]++;
    }
  });
  const best = counts.map((table) => {
    let key = 0;
    for (let i = 1; i < table.length; i++) if (table[i] > table[key]) key = i;
    return key;
  });
  const grid = counts[0][best[0]] >= counts[1][best[1]] ? 0 : 1;
  return pick(pixels.filter((_, i) => keys[grid][i] === best[grid]));
}
/** Map every colour to the most frequent colour within MERGE_DISTANCE of it. */
function mergeColors(data: Uint8ClampedArray): void {
  const counts = new Map<number, number>();
  for (let i = 0; i < data.length; i += CHANNELS) {
    if (!data[i + 3]) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ordered = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([key]) => key);
  const reps: number[] = [];
  const mapping = new Map<number, number>();
  for (const key of ordered) {
    const r = key >> 16,
      g = (key >> 8) & 255,
      b = key & 255;
    const rep = reps.find((candidate) => {
      const dr = (candidate >> 16) - r,
        dg = ((candidate >> 8) & 255) - g,
        db = (candidate & 255) - b;
      return dr * dr + dg * dg + db * db <= MERGE_DISTANCE * MERGE_DISTANCE;
    });
    if (rep === undefined) reps.push(key);
    mapping.set(key, rep ?? key);
  }
  for (let i = 0; i < data.length; i += CHANNELS) {
    if (!data[i + 3]) continue;
    const to = mapping.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])!;
    data[i] = to >> 16;
    data[i + 1] = (to >> 8) & 255;
    data[i + 2] = to & 255;
  }
}

type Rgba4 = [number, number, number, number];
export interface CellColorPickerEntry {
  /** i18n key of the label shown in the import dialog and preferences. */
  readonly label: string;
  /** One RGBA colour for the cell [x0,x1) x [y0,y1), or null when it is mostly transparent. */
  pick(image: PixelBuffer, x0: number, y0: number, x1: number, y1: number): Rgba4 | null;
  /** Optional pass over the finished output (RGBA data), e.g. merging near-duplicate colours. */
  finish?(data: Uint8ClampedArray): void;
}
/** Opaque pixel offsets of a cell, or null when the cell is mostly transparent. */
function opaqueOffsets(image: PixelBuffer, x0: number, y0: number, x1: number, y1: number) {
  const offsets: number[] = [];
  let total = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      total++;
      const o = (y * image.width + x) * CHANNELS;
      if (image.data[o + 3] > 0) offsets.push(o);
    }
  return total && offsets.length >= MIN_OPAQUE_SHARE * total ? offsets : null;
}
const channelsOf = (image: PixelBuffer, offsets: number[], c: number) =>
  offsets.map((o) => image.data[o + c]);
const meanOf = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) / values.length);

/** Colour picker table: every picker works on any grid, whichever detector found it. */
const PICKERS: Readonly<Record<CellColorPicker, CellColorPickerEntry>> = {
  [CellColorPicker.MostCommon]: {
    label: "import.picker.most-common",
    pick: dominantColor,
    finish: mergeColors,
  },
  [CellColorPicker.Average]: {
    label: "import.picker.average",
    pick: (image, x0, y0, x1, y1) => {
      const o = opaqueOffsets(image, x0, y0, x1, y1);
      return o && ([0, 1, 2, 3].map((c) => meanOf(channelsOf(image, o, c))) as Rgba4);
    },
  },
  [CellColorPicker.Median]: {
    label: "import.picker.median",
    pick: (image, x0, y0, x1, y1) => {
      const o = opaqueOffsets(image, x0, y0, x1, y1);
      return (
        o &&
        ([
          median(channelsOf(image, o, 0)),
          median(channelsOf(image, o, 1)),
          median(channelsOf(image, o, 2)),
          meanOf(channelsOf(image, o, 3)),
        ] as Rgba4)
      );
    },
  },
};
export function getColorPickerEntry(picker: CellColorPicker): CellColorPickerEntry {
  const entry = (PICKERS as Partial<Record<string, CellColorPickerEntry>>)[picker];
  if (!entry) throw new RangeError(`Unknown cell color picker: ${picker}`);
  return entry;
}
export function getAllColorPickers(): readonly CellColorPicker[] {
  return Object.keys(PICKERS) as CellColorPicker[];
}
