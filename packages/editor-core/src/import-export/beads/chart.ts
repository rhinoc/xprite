import type { PixelBuffer } from "$/base";
import type { ExportRasterText } from "$/import-export/attribution";
import { BeadError, BeadErrorCode } from "$/import-export/beads/errors";
import {
  EMPTY_BEAD_CELL,
  type BeadGrid,
  type BeadBoard,
  type BeadBoardSize,
} from "$/import-export/beads/grid";
import { BEAD_GLYPH_HEIGHT, BEAD_GLYPH_ADVANCE, drawBeadText } from "$/import-export/beads/text";

export const BEAD_CHART_CELL_SIZE = 40;
export const MAX_BEAD_CHART_PIXELS = 32 * 1024 * 1024;
const MAX_CHART_EDGE = 16384;
const MAX_BOARD_PREVIEW_EDGE = 2048;
const CHANNELS = 4;
const OPAQUE = 255;
const CODE_FONT_SIZE = 18;
const CODE_PADDING = 4;

export function beadChartSize(
  grid: Pick<BeadGrid, "width" | "height">,
  cellSize = BEAD_CHART_CELL_SIZE,
) {
  const width = grid.width * cellSize + 1,
    height = grid.height * cellSize + 1;
  assertBeadChartSize({ width, height });
  return { width, height };
}

export function assertBeadChartSize({ width, height }: { width: number; height: number }) {
  if (width > MAX_CHART_EDGE || height > MAX_CHART_EDGE || width * height > MAX_BEAD_CHART_PIXELS)
    throw new BeadError(BeadErrorCode.ChartTooLarge);
}

export function beadTextInk(rgb: readonly [number, number, number]) {
  return rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114 > 128000 ? 0 : OPAQUE;
}

/** Deterministic raster chart; screen preview and PNG output share the same grid and labels. */
export function renderBeadChart(
  grid: BeadGrid,
  showCodes: boolean,
  boardSize: BeadBoardSize,
  board?: BeadBoard,
  cellSize = BEAD_CHART_CELL_SIZE,
  highlight: string | null = null,
  showGrid = true,
): PixelBuffer {
  const area = board ?? { x: 0, y: 0, width: grid.width, height: grid.height };
  const { width, height } = beadChartSize(area, cellSize);
  const data = new Uint8ClampedArray(width * height * CHANNELS).fill(OPAQUE);
  const target = { width, height, data };
  drawBeadChart(
    target,
    { x: 0, y: 0 },
    grid,
    showCodes,
    boardSize,
    board,
    cellSize,
    highlight,
    showGrid,
  );
  return target;
}

/** Draw into a caller-owned output buffer without allocating a second full chart. */
export function drawBeadChart(
  target: PixelBuffer,
  origin: { x: number; y: number },
  grid: BeadGrid,
  showCodes: boolean,
  boardSize: BeadBoardSize,
  board?: BeadBoard,
  cellSize = BEAD_CHART_CELL_SIZE,
  highlight: string | null = null,
  showGrid = true,
  text?: ExportRasterText,
): void {
  const area = board ?? { x: 0, y: 0, width: grid.width, height: grid.height };
  const { width, height } = beadChartSize(area, cellSize);
  const paint = (x: number, y: number, rgb: readonly number[]) => {
    const offset = ((origin.y + y) * target.width + origin.x + x) * CHANNELS;
    target.data[offset] = rgb[0];
    target.data[offset + 1] = rgb[1];
    target.data[offset + 2] = rgb[2];
  };
  for (let y = 0; y < area.height; y++)
    for (let x = 0; x < area.width; x++) {
      const cell = grid.cells[(area.y + y) * grid.width + area.x + x];
      if (cell === EMPTY_BEAD_CELL) continue;
      const color = grid.colors[cell];
      if (highlight && color.code !== highlight) continue;
      const left = x * cellSize + 1,
        top = y * cellSize + 1;
      for (let py = 0; py < cellSize - 1; py++)
        for (let px = 0; px < cellSize - 1; px++) paint(left + px, top + py, color.rgb);
      if (text && showCodes) {
        let size = Math.min(CODE_FONT_SIZE, cellSize - CODE_PADDING);
        while (size > 1 && text.measure(color.code, size).width > cellSize - CODE_PADDING) size--;
        const bounds = text.measure(color.code, size);
        if (bounds.height <= cellSize - CODE_PADDING) {
          const ink = beadTextInk(color.rgb);
          text.draw(
            target,
            color.code,
            origin.x + x * cellSize + Math.floor((cellSize - bounds.width) / 2),
            origin.y + y * cellSize + Math.floor((cellSize - bounds.height) / 2),
            size,
            [ink, ink, ink],
          );
        }
        continue;
      }
      if (
        !showCodes ||
        cellSize < BEAD_GLYPH_HEIGHT + 2 ||
        cellSize < color.code.length * BEAD_GLYPH_ADVANCE + 2
      )
        continue;
      const scale = Math.max(
        1,
        Math.min(3, Math.floor((cellSize - 4) / (color.code.length * BEAD_GLYPH_ADVANCE))),
      );
      const labelWidth = (color.code.length * BEAD_GLYPH_ADVANCE - 1) * scale;
      const labelX = x * cellSize + Math.floor((cellSize - labelWidth) / 2);
      const labelY = y * cellSize + Math.floor((cellSize - BEAD_GLYPH_HEIGHT * scale) / 2);
      const ink = beadTextInk(color.rgb);
      drawBeadText(target, color.code, origin.x + labelX, origin.y + labelY, scale, [
        ink,
        ink,
        ink,
      ]);
    }
  if (showGrid) {
    for (let x = 0; x <= area.width; x++) {
      const boundary = (area.x + x) % boardSize.width === 0;
      for (let y = 0; y < height; y++)
        paint(x * cellSize, y, boundary ? [0, 0, 0] : [150, 150, 150]);
    }
    for (let y = 0; y <= area.height; y++) {
      const boundary = (area.y + y) % boardSize.height === 0;
      for (let x = 0; x < width; x++)
        paint(x, y * cellSize, boundary ? [0, 0, 0] : [150, 150, 150]);
    }
  }
}

export function beadPreviewCellSize(area: Pick<BeadGrid, "width" | "height">): number {
  return Math.min(
    BEAD_CHART_CELL_SIZE,
    Math.floor((MAX_BOARD_PREVIEW_EDGE - 1) / Math.max(area.width, area.height)),
  );
}

/** Keep large custom boards inexpensive to preview without changing output resolution. */
export function renderBeadBoardPreview(
  grid: BeadGrid,
  showCodes: boolean,
  boardSize: BeadBoardSize,
  board: BeadBoard,
  highlight: string | null = null,
  showGrid = true,
): PixelBuffer {
  return renderBeadChart(
    grid,
    showCodes,
    boardSize,
    board,
    beadPreviewCellSize(board),
    highlight,
    showGrid,
  );
}

export function renderBeadOverviewPreview(
  grid: BeadGrid,
  showCodes: boolean,
  boardSize: BeadBoardSize,
  highlight: string | null = null,
  showGrid = true,
): PixelBuffer {
  return renderBeadChart(
    grid,
    showCodes,
    boardSize,
    undefined,
    beadPreviewCellSize(grid),
    highlight,
    showGrid,
  );
}
