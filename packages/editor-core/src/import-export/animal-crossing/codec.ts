import { strToU8, zipSync } from "fflate";
import decodeQR from "qr/decode.js";

import type { PixelBuffer } from "$/base";
import { ANIMAL_CROSSING_COLORS } from "$/import-export/animal-crossing/palette";
import { qrCodePixels } from "$/import-export/qr-code";

export const ANIMAL_CROSSING_SIZE = 32;
export const MAX_ANIMAL_CROSSING_PATTERNS = 256;
const COLOR_LIMIT = 15;
const TRANSPARENT_INDEX = 15;
const ALPHA_CUTOFF = 128;
const CHANNELS = 4;
const OPAQUE = 255;
const BYTE_LENGTH = 620;
const PALETTE_OFFSET = 0x58;
const PIXEL_OFFSET = 0x6c;
const QR_SCALE = 6;
const ANIMAL_CROSSING_TITLE_UNITS = 20;
const ANIMAL_CROSSING_NAME_UNITS = 9;
const NORMAL_PATTERN = 9;
const NIBBLE_BITS = 4;
const RGB_RED_SHIFT = 16;
const RGB_GREEN_SHIFT = 8;
const ALPHA_CHANNEL = 3;
const PIXELS_PER_BYTE = 2;
const HEADER = {
  creatorId: 0x2a,
  creatorName: 0x2c,
  townId: 0x40,
  townName: 0x42,
  region: 0x56,
  color: 0x67,
  quality: 0x68,
  type: 0x69,
} as const;
const DEFAULT_REGION = 0x3119;
const DEFAULT_COLOR = 0xcc;
const DEFAULT_QUALITY = 0x0a;
const DEFAULT_CREATOR_ID = 60598;
const DEFAULT_TOWN_ID = 50500;

export interface AnimalCrossingSettings {
  title: string;
  creator: string;
  town: string;
  cellWidth: number;
  cellHeight: number;
  offsetX: number;
  offsetY: number;
  spacingX: number;
  spacingY: number;
}
export interface AnimalCrossingPattern {
  title: string;
  column: number;
  row: number;
  bytes: Uint8Array;
  pixels: PixelBuffer;
}
export interface AnimalCrossingResult {
  columns: number;
  rows: number;
  patterns: AnimalCrossingPattern[];
  pixels: PixelBuffer;
}
export function defaultAnimalCrossingSettings(
  pixels: Pick<PixelBuffer, "width" | "height">,
): AnimalCrossingSettings {
  return {
    title: "Pattern",
    creator: "Xprite",
    town: "Island",
    cellWidth: Math.min(ANIMAL_CROSSING_SIZE, pixels.width),
    cellHeight: Math.min(ANIMAL_CROSSING_SIZE, pixels.height),
    offsetX: 0,
    offsetY: 0,
    spacingX: 0,
    spacingY: 0,
  };
}
const rgb = (value: number) => [
  (value >>> RGB_RED_SHIFT) & OPAQUE,
  (value >>> RGB_GREEN_SHIFT) & OPAQUE,
  value & OPAQUE,
];
const distance = (a: number, b: number) => {
  const red = ((a >>> RGB_RED_SHIFT) & OPAQUE) - ((b >>> RGB_RED_SHIFT) & OPAQUE);
  const green = ((a >>> RGB_GREEN_SHIFT) & OPAQUE) - ((b >>> RGB_GREEN_SHIFT) & OPAQUE);
  const blue = (a & OPAQUE) - (b & OPAQUE);
  return red * red + green * green + blue * blue;
};
function closest(color: number, palette: readonly { rgb: number }[]) {
  let index = 0,
    best = Infinity;
  palette.forEach((candidate, i) => {
    const value = distance(color, candidate.rgb);
    if (value < best) {
      best = value;
      index = i;
    }
  });
  return index;
}
function truncateText(text: string, units: number) {
  // Avoid leaving half of a surrogate pair at the field boundary.
  let truncated = "";
  for (const char of text) {
    if (truncated.length + char.length > units) break;
    truncated += char;
  }
  return truncated;
}
function writeText(view: DataView, offset: number, units: number, text: string) {
  const truncated = truncateText(text, units);
  for (let i = 0; i < truncated.length; i++)
    view.setUint16(offset + i * 2, truncated.charCodeAt(i), true);
}

export function animalCrossingGrid(
  pixels: Pick<PixelBuffer, "width" | "height">,
  settings: AnimalCrossingSettings,
) {
  const { cellWidth, cellHeight, offsetX, offsetY, spacingX, spacingY } = settings;
  const numbers = [cellWidth, cellHeight, offsetX, offsetY, spacingX, spacingY];
  if (
    numbers.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    cellWidth < 1 ||
    cellHeight < 1
  )
    throw new Error("Enter positive whole-number cell sizes and non-negative offsets and spacing.");
  if (offsetX >= pixels.width || offsetY >= pixels.height)
    throw new Error("The starting offset must be inside the image.");
  const columns = Math.ceil((pixels.width - offsetX) / (cellWidth + spacingX));
  const rows = Math.ceil((pixels.height - offsetY) / (cellHeight + spacingY));
  if (columns * rows > MAX_ANIMAL_CROSSING_PATTERNS)
    throw new Error(
      `Choose larger cells: export supports up to ${MAX_ANIMAL_CROSSING_PATTERNS} patterns at once.`,
    );
  const cells = Array.from({ length: columns * rows }, (_, index) => {
    const x = offsetX + (index % columns) * (cellWidth + spacingX);
    const y = offsetY + Math.floor(index / columns) * (cellHeight + spacingY);
    return {
      x,
      y,
      width: Math.min(cellWidth, pixels.width - x),
      height: Math.min(cellHeight, pixels.height - y),
    };
  });
  return { columns, rows, cells };
}

/** Normal ACNL patterns import through NookLink; MO/MA identifiers require Nintendo publishing. */
export function convertAnimalCrossing(
  pixels: PixelBuffer,
  settings: AnimalCrossingSettings,
): AnimalCrossingResult {
  if (
    !Number.isSafeInteger(pixels.width) ||
    !Number.isSafeInteger(pixels.height) ||
    pixels.width < 1 ||
    pixels.height < 1 ||
    pixels.data.length !== pixels.width * pixels.height * CHANNELS
  )
    throw new Error("The source must contain a complete RGBA image.");
  const { cellWidth, cellHeight, offsetX, offsetY, spacingX, spacingY } = settings;
  const { columns, rows } = animalCrossingGrid(pixels, settings);
  const samples: (number | null)[][] = [];
  const counts = new Map<number, number>();
  const mappedColors = new Map<number, number>();
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const sample: (number | null)[] = [];
      for (let y = 0; y < ANIMAL_CROSSING_SIZE; y++)
        for (let x = 0; x < ANIMAL_CROSSING_SIZE; x++) {
          const sourceX =
            offsetX +
            column * (cellWidth + spacingX) +
            Math.floor((x * cellWidth) / ANIMAL_CROSSING_SIZE);
          const sourceY =
            offsetY +
            row * (cellHeight + spacingY) +
            Math.floor((y * cellHeight) / ANIMAL_CROSSING_SIZE);
          const offset = (sourceY * pixels.width + sourceX) * CHANNELS;
          if (
            sourceX >= pixels.width ||
            sourceY >= pixels.height ||
            pixels.data[offset + ALPHA_CHANNEL] < ALPHA_CUTOFF
          ) {
            sample.push(null);
            continue;
          }
          const color =
            (pixels.data[offset] << RGB_RED_SHIFT) |
            (pixels.data[offset + 1] << RGB_GREEN_SHIFT) |
            pixels.data[offset + 2];
          let code = mappedColors.get(color);
          if (code === undefined) {
            code = closest(color, ANIMAL_CROSSING_COLORS);
            mappedColors.set(color, code);
          }
          sample.push(code);
          counts.set(code, (counts.get(code) ?? 0) + 1);
        }
      samples.push(sample);
    }
  // Share one palette across the map so touching tiles quantize consistently.
  const candidates = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a - b);
  const selected = candidates.slice(0, 1);
  while (selected.length < Math.min(COLOR_LIMIT, candidates.length)) {
    let best = -1,
      score = -1;
    for (const candidate of candidates) {
      if (selected.includes(candidate)) continue;
      const error = Math.min(
        ...selected.map((index) =>
          distance(ANIMAL_CROSSING_COLORS[candidate].rgb, ANIMAL_CROSSING_COLORS[index].rgb),
        ),
      );
      const weighted = error * counts.get(candidate)!;
      if (weighted > score) {
        score = weighted;
        best = candidate;
      }
    }
    selected.push(best);
  }
  const palette = selected.map((index) => ANIMAL_CROSSING_COLORS[index]);
  const preview: PixelBuffer = {
    width: columns * ANIMAL_CROSSING_SIZE,
    height: rows * ANIMAL_CROSSING_SIZE,
    data: new Uint8ClampedArray(columns * rows * ANIMAL_CROSSING_SIZE ** 2 * CHANNELS),
  };
  const patterns = samples.map((sample, index): AnimalCrossingPattern => {
    const column = index % columns,
      row = Math.floor(index / columns);
    const suffix = samples.length > 1 ? ` ${column + 1}-${row + 1}` : "";
    const title =
      truncateText(settings.title, ANIMAL_CROSSING_TITLE_UNITS - suffix.length) + suffix;
    const bytes = new Uint8Array(BYTE_LENGTH),
      view = new DataView(bytes.buffer);
    writeText(view, 0, ANIMAL_CROSSING_TITLE_UNITS, title);
    view.setUint16(HEADER.creatorId, DEFAULT_CREATOR_ID, true);
    writeText(
      view,
      HEADER.creatorName,
      ANIMAL_CROSSING_NAME_UNITS,
      settings.creator.trim() || "Xprite",
    );
    view.setUint16(HEADER.townId, DEFAULT_TOWN_ID, true);
    writeText(view, HEADER.townName, ANIMAL_CROSSING_NAME_UNITS, settings.town.trim() || "Island");
    view.setUint16(HEADER.region, DEFAULT_REGION, true);
    bytes[HEADER.color] = DEFAULT_COLOR;
    bytes[HEADER.quality] = DEFAULT_QUALITY;
    bytes[HEADER.type] = NORMAL_PATTERN;
    bytes.fill(ANIMAL_CROSSING_COLORS[0].code, PALETTE_OFFSET, PALETTE_OFFSET + COLOR_LIMIT);
    palette.forEach((color, i) => {
      bytes[PALETTE_OFFSET + i] = color.code;
    });
    const patternPixels: PixelBuffer = {
      width: ANIMAL_CROSSING_SIZE,
      height: ANIMAL_CROSSING_SIZE,
      data: new Uint8ClampedArray(ANIMAL_CROSSING_SIZE ** 2 * CHANNELS),
    };
    sample.forEach((color, i) => {
      const paletteIndex =
        color === null ? TRANSPARENT_INDEX : closest(ANIMAL_CROSSING_COLORS[color].rgb, palette);
      bytes[PIXEL_OFFSET + Math.floor(i / PIXELS_PER_BYTE)] |=
        paletteIndex << ((i % PIXELS_PER_BYTE) * NIBBLE_BITS);
      if (color === null) return;
      const rgba = [...rgb(palette[paletteIndex].rgb), OPAQUE];
      patternPixels.data.set(rgba, i * CHANNELS);
      const x = column * ANIMAL_CROSSING_SIZE + (i % ANIMAL_CROSSING_SIZE);
      const y = row * ANIMAL_CROSSING_SIZE + Math.floor(i / ANIMAL_CROSSING_SIZE);
      preview.data.set(rgba, (y * preview.width + x) * CHANNELS);
    });
    return { title, column, row, bytes, pixels: patternPixels };
  });
  return { columns, rows, patterns, pixels: preview };
}

export interface ImportedAnimalCrossingPattern extends AnimalCrossingPattern {
  creator: string;
  town: string;
}
function readText(bytes: Uint8Array, offset: number, units: number): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let text = "";
  for (let i = 0; i < units; i++) {
    const value = view.getUint16(offset + i * PIXELS_PER_BYTE, true);
    if (!value) break;
    text += String.fromCharCode(value);
  }
  return text;
}

/** Keep all metadata, palette ordering, unused slots and reserved bytes untouched. */
export function readAnimalCrossingPattern(input: Uint8Array): ImportedAnimalCrossingPattern {
  if (input.length !== BYTE_LENGTH || input[HEADER.type] !== NORMAL_PATTERN)
    throw new Error("Choose a single QR code for a normal 32 × 32 Animal Crossing design.");
  const bytes = new Uint8Array(input);
  const pixels: PixelBuffer = {
    width: ANIMAL_CROSSING_SIZE,
    height: ANIMAL_CROSSING_SIZE,
    data: new Uint8ClampedArray(ANIMAL_CROSSING_SIZE ** 2 * CHANNELS),
  };
  for (let i = 0; i < ANIMAL_CROSSING_SIZE ** 2; i++) {
    const value = bytes[PIXEL_OFFSET + Math.floor(i / PIXELS_PER_BYTE)];
    const index = (value >>> ((i % PIXELS_PER_BYTE) * NIBBLE_BITS)) & TRANSPARENT_INDEX;
    if (index === TRANSPARENT_INDEX) continue;
    const color = ANIMAL_CROSSING_COLORS.find(
      (color) => color.code === bytes[PALETTE_OFFSET + index],
    );
    if (!color)
      throw new Error("The QR code contains an unsupported Animal Crossing palette color.");
    pixels.data.set([...rgb(color.rgb), OPAQUE], i * CHANNELS);
  }
  return {
    title: readText(bytes, 0, ANIMAL_CROSSING_TITLE_UNITS),
    creator: readText(bytes, HEADER.creatorName, ANIMAL_CROSSING_NAME_UNITS),
    town: readText(bytes, HEADER.townName, ANIMAL_CROSSING_NAME_UNITS),
    column: 0,
    row: 0,
    bytes,
    pixels,
  };
}
const QR_SCAN_TIME_LIMIT_MS = 2000;

/** Capture BYTE segments before text conversion; UTF-8 decoding loses arbitrary game bytes. */
export function readAnimalCrossingQr(pixels: PixelBuffer): ImportedAnimalCrossingPattern | null {
  const chunks: Uint8Array[] = [];
  let text: string;
  try {
    text = decodeQR(pixels, {
      effort: Infinity,
      timeLimit: QR_SCAN_TIME_LIMIT_MS,
      textDecoder(bytes) {
        chunks.push(new Uint8Array(bytes));
        return "";
      },
    });
  } catch {
    return null;
  }
  if (text || !chunks.length) throw new Error("This QR code is not an Animal Crossing design.");
  const length = chunks.reduce((sum, bytes) => sum + bytes.length, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return readAnimalCrossingPattern(bytes);
}
export function importedAnimalCrossingResult(
  pattern: ImportedAnimalCrossingPattern,
): AnimalCrossingResult {
  return { columns: 1, rows: 1, patterns: [pattern], pixels: pattern.pixels };
}

/** A single raw BYTE segment, without UTF-8 or ECI conversion, is required by the game. */
export function animalCrossingQrPixels(bytes: Uint8Array): PixelBuffer {
  if (bytes.length !== BYTE_LENGTH) throw new Error("A normal design must contain 620 bytes.");
  return qrCodePixels(bytes, QR_SCALE);
}

export async function animalCrossingArchive(
  result: AnimalCrossingResult,
  encodePng: (pixels: PixelBuffer) => Promise<Uint8Array>,
): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const manifest = [];
  for (const pattern of result.patterns) {
    const name = `r${pattern.row + 1}-c${pattern.column + 1}`;
    files[`${name}.acnl`] = pattern.bytes;
    files[`${name}-qr.png`] = await encodePng(animalCrossingQrPixels(pattern.bytes));
    files[`${name}-pattern.png`] = await encodePng(pattern.pixels);
    manifest.push({
      title: pattern.title,
      row: pattern.row + 1,
      column: pattern.column + 1,
      qr: `${name}-qr.png`,
      pattern: `${name}.acnl`,
    });
  }
  files["preview.png"] = await encodePng(result.pixels);
  files["layout.json"] = strToU8(
    JSON.stringify(
      {
        columns: result.columns,
        rows: result.rows,
        cellSize: ANIMAL_CROSSING_SIZE,
        patterns: manifest,
      },
      null,
      2,
    ),
  );
  return zipSync(files);
}
