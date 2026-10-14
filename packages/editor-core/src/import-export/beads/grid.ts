import { UINT8_MAX, type PixelBuffer } from "$/base";
import { BeadError, BeadErrorCode } from "$/import-export/beads/errors";

export interface BeadColor {
  readonly code: string;
  readonly name: string;
  readonly rgb: readonly [number, number, number];
}
export interface BeadGrid {
  width: number;
  height: number;
  colors: readonly BeadColor[];
  cells: Int32Array;
  usage: readonly { color: BeadColor; quantity: number }[];
  total: number;
}
export const EMPTY_BEAD_CELL = -1;
/** Pixels below half coverage are anti-aliasing or shadows, not pegs. */
export const BEAD_ALPHA_THRESHOLD = 128;
const RGBA_CHANNELS = 4;
const RGB_BASE = 256;

type Lab = readonly [number, number, number];
const SRGB_LINEAR = Float64Array.from({ length: RGB_BASE }, (_, value) => {
  const channel = value / UINT8_MAX;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
});
const D65 = [0.95047, 1, 1.08883] as const;
const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;
const labPivot = (value: number) =>
  value > LAB_EPSILON ? Math.cbrt(value) : (LAB_KAPPA * value + 16) / 116;

/** sRGB (D65) to CIELAB; perceptual distance matches beads better than raw RGB. */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const lr = SRGB_LINEAR[r],
    lg = SRGB_LINEAR[g],
    lb = SRGB_LINEAR[b];
  const x = labPivot((lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / D65[0]);
  const y = labPivot((lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175) / D65[1]);
  const z = labPivot((lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / D65[2]);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const paletteLab = new WeakMap<readonly BeadColor[], readonly Lab[]>();
function labColors(colors: readonly BeadColor[]): readonly Lab[] {
  let lab = paletteLab.get(colors);
  if (!lab) {
    lab = colors.map(({ rgb }) => rgbToLab(rgb[0], rgb[1], rgb[2]));
    paletteLab.set(colors, lab);
  }
  return lab;
}

/** Index of the palette color nearest in CIELAB (CIE76); ties keep palette order. */
export function nearestBeadColor(
  colors: readonly BeadColor[],
  rgb: readonly [number, number, number],
): number {
  const palette = labColors(colors);
  const [l, a, b] = rgbToLab(rgb[0], rgb[1], rgb[2]);
  let nearest = 0;
  let distance = Infinity;
  for (let candidate = 0; candidate < palette.length; candidate++) {
    const target = palette[candidate];
    const delta = (l - target[0]) ** 2 + (a - target[1]) ** 2 + (b - target[2]) ** 2;
    if (delta < distance) {
      distance = delta;
      nearest = candidate;
    }
  }
  return nearest;
}

/** One input pixel is one bead. Alpha below 128 is empty; input buffers are never written. */
export function mapBeadGrid(pixels: Readonly<PixelBuffer>, colors: readonly BeadColor[]): BeadGrid {
  if (!colors.length) throw new BeadError(BeadErrorCode.MissingPalette);
  if (
    !Number.isSafeInteger(pixels.width) ||
    pixels.width < 1 ||
    !Number.isSafeInteger(pixels.height) ||
    pixels.height < 1 ||
    pixels.data.length !== pixels.width * pixels.height * RGBA_CHANNELS
  )
    throw new BeadError(BeadErrorCode.InvalidSource);
  const cells = new Int32Array(pixels.width * pixels.height).fill(EMPTY_BEAD_CELL);
  const counts = new Uint32Array(colors.length);
  const cache = new Map<number, number>();
  let total = 0;
  for (let index = 0; index < cells.length; index++) {
    const offset = index * RGBA_CHANNELS;
    if (pixels.data[offset + 3] < BEAD_ALPHA_THRESHOLD) continue;
    const r = pixels.data[offset],
      g = pixels.data[offset + 1],
      b = pixels.data[offset + 2];
    const key = (r * RGB_BASE + g) * RGB_BASE + b;
    let nearest = cache.get(key);
    if (nearest === undefined) {
      nearest = nearestBeadColor(colors, [r, g, b]);
      cache.set(key, nearest);
    }
    cells[index] = nearest;
    counts[nearest]++;
    total++;
  }
  return {
    width: pixels.width,
    height: pixels.height,
    colors,
    cells,
    total,
    usage: colors.flatMap((color, index) =>
      counts[index] ? [{ color, quantity: counts[index] }] : [],
    ),
  };
}

export interface BeadBoard {
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BeadBoardSize {
  readonly width: number;
  readonly height: number;
}

export const DEFAULT_BEAD_BOARD_SIZE: BeadBoardSize = { width: 29, height: 29 };
/** Common pegboard sizes offered next to the width and height inputs. */
export const BEAD_BOARD_PRESETS: readonly BeadBoardSize[] = [
  { width: 29, height: 29 },
  { width: 14, height: 14 },
  { width: 52, height: 52 },
];
export const MAX_BEAD_BOARD_EDGE = 512;
export const MIN_BEAD_BOARD_EDGE = 1;

export function isValidBeadBoardSize(value: unknown): value is BeadBoardSize {
  if (!value || typeof value !== "object") return false;
  const size = value as BeadBoardSize;
  return [size.width, size.height].every(
    (edge) =>
      Number.isSafeInteger(edge) && edge >= MIN_BEAD_BOARD_EDGE && edge <= MAX_BEAD_BOARD_EDGE,
  );
}

/** One color sample per bead for an inexpensive full-pattern overview. */
export function beadGridPixels(grid: BeadGrid): PixelBuffer {
  const data = new Uint8ClampedArray(grid.width * grid.height * RGBA_CHANNELS);
  for (let index = 0; index < grid.cells.length; index++) {
    const cell = grid.cells[index];
    if (cell === EMPTY_BEAD_CELL) continue;
    const offset = index * RGBA_CHANNELS;
    data.set(grid.colors[cell].rgb, offset);
    data[offset + 3] = UINT8_MAX;
  }
  return { width: grid.width, height: grid.height, data };
}

export function beadBoards(
  grid: Pick<BeadGrid, "width" | "height">,
  boardSize: BeadBoardSize,
): BeadBoard[] {
  if (!isValidBeadBoardSize(boardSize)) throw new BeadError(BeadErrorCode.InvalidBoardSize);
  const boards: BeadBoard[] = [];
  for (let y = 0, row = 0; y < grid.height; y += boardSize.height, row++)
    for (let x = 0, column = 0; x < grid.width; x += boardSize.width, column++)
      boards.push({
        column,
        row,
        x,
        y,
        width: Math.min(boardSize.width, grid.width - x),
        height: Math.min(boardSize.height, grid.height - y),
      });
  return boards;
}

/** Upper bound for one PDF; checked before any output is rendered. */
export const MAX_BEAD_BOARDS = 1024;

export function beadBoardCount(
  grid: Pick<BeadGrid, "width" | "height">,
  boardSize: BeadBoardSize,
): number {
  if (!isValidBeadBoardSize(boardSize)) throw new BeadError(BeadErrorCode.InvalidBoardSize);
  return Math.ceil(grid.width / boardSize.width) * Math.ceil(grid.height / boardSize.height);
}

export function assertBeadBoardCount(
  grid: Pick<BeadGrid, "width" | "height">,
  boardSize: BeadBoardSize,
): void {
  if (beadBoardCount(grid, boardSize) > MAX_BEAD_BOARDS)
    throw new BeadError(BeadErrorCode.TooManyBoards);
}
