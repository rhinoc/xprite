import type { PixelBuffer } from "$/base";
import { EMPTY_BEAD_CELL, type BeadGrid, type BeadBoard } from "$/import-export/beads/grid";

export const BEAD_CHART_CELL_SIZE = 40;
export const MAX_BEAD_CHART_PIXELS = 32 * 1024 * 1024;
const MAX_CHART_EDGE = 16384;
const CHANNELS = 4;
const OPAQUE = 255;
const GLYPH_WIDTH = 3;
const GLYPH_HEIGHT = 5;
const GLYPH_ADVANCE = 4;
const GLYPHS: Record<string, readonly string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["111", "100", "100", "100", "111"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  F: ["111", "100", "110", "100", "100"],
  G: ["111", "100", "101", "101", "111"],
  H: ["101", "101", "111", "101", "101"],
  M: ["101", "111", "111", "101", "101"],
  S: ["111", "100", "111", "001", "111"],
  L: ["100", "100", "100", "100", "111"],
  N: ["101", "111", "111", "111", "101"],
  P: ["111", "101", "111", "100", "100"],
  T: ["111", "010", "010", "010", "010"],
  "-": ["000", "000", "111", "000", "000"],
};

export function beadChartSize(
  grid: Pick<BeadGrid, "width" | "height">,
  cellSize = BEAD_CHART_CELL_SIZE,
) {
  const width = grid.width * cellSize + 1,
    height = grid.height * cellSize + 1;
  if (width > MAX_CHART_EDGE || height > MAX_CHART_EDGE || width * height > MAX_BEAD_CHART_PIXELS)
    throw new Error("The PNG chart is too large. Export a PDF with separate boards instead.");
  return { width, height };
}

export function beadTextInk(rgb: readonly [number, number, number]) {
  return rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114 > 128000 ? 0 : OPAQUE;
}

/** Deterministic raster chart; screen preview and PNG output share the same grid and labels. */
export function renderBeadChart(
  grid: BeadGrid,
  showCodes: boolean,
  boardSize: number,
  board?: BeadBoard,
  cellSize = BEAD_CHART_CELL_SIZE,
): PixelBuffer {
  const area = board ?? { x: 0, y: 0, width: grid.width, height: grid.height };
  const { width, height } = beadChartSize(area, cellSize);
  const data = new Uint8ClampedArray(width * height * CHANNELS).fill(OPAQUE);
  const paint = (x: number, y: number, rgb: readonly number[]) => {
    const offset = (y * width + x) * CHANNELS;
    data[offset] = rgb[0];
    data[offset + 1] = rgb[1];
    data[offset + 2] = rgb[2];
  };
  for (let y = 0; y < area.height; y++)
    for (let x = 0; x < area.width; x++) {
      const cell = grid.cells[(area.y + y) * grid.width + area.x + x];
      if (cell === EMPTY_BEAD_CELL) continue;
      const color = grid.colors[cell];
      const left = x * cellSize + 1,
        top = y * cellSize + 1;
      for (let py = 0; py < cellSize - 1; py++)
        for (let px = 0; px < cellSize - 1; px++) paint(left + px, top + py, color.rgb);
      if (!showCodes) continue;
      const scale = Math.max(
        1,
        Math.min(3, Math.floor((cellSize - 4) / (color.code.length * GLYPH_ADVANCE))),
      );
      const labelWidth = (color.code.length * GLYPH_ADVANCE - 1) * scale;
      const labelX = x * cellSize + Math.floor((cellSize - labelWidth) / 2);
      const labelY = y * cellSize + Math.floor((cellSize - GLYPH_HEIGHT * scale) / 2);
      const ink = beadTextInk(color.rgb);
      for (let letter = 0; letter < color.code.length; letter++) {
        const glyph = GLYPHS[color.code[letter]];
        if (!glyph) continue;
        for (let gy = 0; gy < GLYPH_HEIGHT; gy++)
          for (let gx = 0; gx < GLYPH_WIDTH; gx++)
            if (glyph[gy][gx] === "1")
              for (let sy = 0; sy < scale; sy++)
                for (let sx = 0; sx < scale; sx++)
                  paint(
                    labelX + letter * GLYPH_ADVANCE * scale + gx * scale + sx,
                    labelY + gy * scale + sy,
                    [ink, ink, ink],
                  );
      }
    }
  for (let x = 0; x <= area.width; x++) {
    const boundary = (area.x + x) % boardSize === 0;
    for (let y = 0; y < height; y++) paint(x * cellSize, y, boundary ? [0, 0, 0] : [150, 150, 150]);
  }
  for (let y = 0; y <= area.height; y++) {
    const boundary = (area.y + y) % boardSize === 0;
    for (let x = 0; x < width; x++) paint(x, y * cellSize, boundary ? [0, 0, 0] : [150, 150, 150]);
  }
  return { width, height, data };
}
