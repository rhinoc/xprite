import type { PixelBuffer } from "$/base";
import {
  exportImageRuns,
  type ExportAttribution,
  type ExportRasterText,
} from "$/import-export/attribution";
import {
  assertBeadChartSize,
  beadChartSize,
  BEAD_CHART_CELL_SIZE,
  drawBeadChart,
} from "$/import-export/beads/chart";
import { beadBoards, type BeadGrid, type BeadBoardSize } from "$/import-export/beads/grid";
import { beadTextWidth, drawBeadText } from "$/import-export/beads/text";
import { qrCodePixels } from "$/import-export/qr-code";

const CHANNELS = 4;
const OPAQUE = 255;
const INK = [0, 0, 0] as const;
const LINE = [150, 150, 150] as const;
const MIN_SHEET_WIDTH = 960;
const MARGIN = 48;
const AXIS_GUTTER = 80;
const HEADER_HEIGHT = 192;
const LEGEND_HEADING_HEIGHT = 48;
const LEGEND_ROW_HEIGHT = 64;
const MIN_LEGEND_COLUMN_WIDTH = 320;
const MAX_LEGEND_COLUMNS = 4;
const COORDINATE_SCALE = 2;
const LABEL_SCALE = 3;
const TITLE_SCALE = 6;
const SWATCH_SIZE = 32;
const SWATCH_GAP = 16;
const FOOTER_HEIGHT = 192;
const FOOTER_GAP = 24;
const FOOTER_IMAGE_TOP = 16;
const TEXT_SIZE_PER_SCALE = 6;
const QR_SCALE = 4;
const ANNOTATIONS = {
  brandTop: 96,
  countsTop: 136,
  boardsTop: 164,
  columnTopGap: 28,
  columnBottomGap: 16,
  rowGap: 12,
  rowBaseline: 15,
  boardColumnGap: 56,
  boardRowBaseline: 8,
  separatorGap: 24,
  colorNameOffset: 24,
  swatchBorder: 1,
  headingScale: 4,
  title: "FUSE BEAD PATTERN",
  materials: "MATERIALS - CODE / COLOR / QUANTITY",
} as const;

export function beadPatternSheetSize(
  grid: BeadGrid,
  cellSize = BEAD_CHART_CELL_SIZE,
  attribution?: Pick<ExportAttribution, "name" | "url">,
) {
  const chart = beadChartSize(grid, cellSize);
  const width = Math.max(MIN_SHEET_WIDTH, chart.width + (MARGIN + AXIS_GUTTER) * 2);
  const legendColumns = Math.max(
    1,
    Math.min(MAX_LEGEND_COLUMNS, Math.floor((width - MARGIN * 2) / MIN_LEGEND_COLUMN_WIDTH)),
  );
  const legendRows = Math.ceil(grid.usage.length / legendColumns);
  const chartTop = HEADER_HEIGHT + AXIS_GUTTER;
  const legendTop = chartTop + chart.height + AXIS_GUTTER;
  const legendBottom = legendTop + LEGEND_HEADING_HEIGHT + legendRows * LEGEND_ROW_HEIGHT;
  const footerTop = legendBottom + FOOTER_GAP;
  const height = attribution ? footerTop + FOOTER_HEIGHT + MARGIN : legendBottom + MARGIN;
  assertBeadChartSize({ width, height });
  return {
    width,
    height,
    chart,
    chartLeft: Math.floor((width - chart.width) / 2),
    chartTop,
    legendTop,
    legendColumns,
    footerTop,
  };
}

/** A complete chart: brand, counts, global coordinates, board guides and a material legend. */
export function renderBeadPatternSheet(
  grid: BeadGrid,
  brand: string,
  showCodes: boolean,
  boardSize: BeadBoardSize,
  attribution?: ExportAttribution,
  text?: ExportRasterText,
): PixelBuffer {
  const layout = beadPatternSheetSize(grid, BEAD_CHART_CELL_SIZE, attribution);
  const { width, height, chartLeft, chartTop, legendTop, legendColumns } = layout;
  const sheet = {
    width,
    height,
    data: new Uint8ClampedArray(width * height * CHANNELS).fill(OPAQUE),
  };
  const chart = layout.chart;
  drawBeadChart(
    sheet,
    { x: chartLeft, y: chartTop },
    grid,
    showCodes,
    boardSize,
    undefined,
    BEAD_CHART_CELL_SIZE,
    null,
    true,
    text,
  );
  const textWidth = (value: string, scale: number) =>
    text ? text.measure(value, scale * TEXT_SIZE_PER_SCALE).width : beadTextWidth(value, scale);
  const label = (value: string, x: number, y: number, scale = LABEL_SCALE) =>
    text
      ? text.draw(sheet, value, x, y, scale * TEXT_SIZE_PER_SCALE, INK)
      : drawBeadText(sheet, value, x, y, scale, INK);
  const centered = (value: string, center: number, y: number, scale = COORDINATE_SCALE) =>
    label(value, Math.round(center - textWidth(value, scale) / 2), y, scale);
  const rectangle = (x: number, y: number, w: number, h: number, rgb: readonly number[]) => {
    for (let row = y; row < y + h; row++)
      for (let column = x; column < x + w; column++) {
        const offset = (row * width + column) * CHANNELS;
        sheet.data[offset] = rgb[0];
        sheet.data[offset + 1] = rgb[1];
        sheet.data[offset + 2] = rgb[2];
      }
  };
  const columns = Math.ceil(grid.width / boardSize.width);
  const rows = Math.ceil(grid.height / boardSize.height);
  const boards = beadBoards(grid, boardSize);
  label(ANNOTATIONS.title, MARGIN, MARGIN, TITLE_SCALE);
  label(brand, MARGIN, ANNOTATIONS.brandTop, ANNOTATIONS.headingScale);
  label(
    `${grid.width} X ${grid.height} | BEADS ${grid.total} | COLORS ${grid.usage.length} | BOARDS ${boards.length}`,
    MARGIN,
    ANNOTATIONS.countsTop,
  );
  label(
    `BOARD ${boardSize.width} X ${boardSize.height} | ${rows} ROWS X ${columns} COLUMNS`,
    MARGIN,
    ANNOTATIONS.boardsTop,
  );
  for (let column = 0; column < grid.width; column++) {
    const center = chartLeft + (column + 0.5) * BEAD_CHART_CELL_SIZE;
    centered(String(column + 1), center, chartTop - ANNOTATIONS.columnTopGap);
    centered(String(column + 1), center, chartTop + chart.height + ANNOTATIONS.columnBottomGap);
  }
  for (let row = 0; row < grid.height; row++) {
    const value = String(row + 1);
    const y = chartTop + row * BEAD_CHART_CELL_SIZE + ANNOTATIONS.rowBaseline;
    label(
      value,
      chartLeft - ANNOTATIONS.rowGap - textWidth(value, COORDINATE_SCALE),
      y,
      COORDINATE_SCALE,
    );
    label(value, chartLeft + chart.width + ANNOTATIONS.rowGap, y, COORDINATE_SCALE);
  }
  for (let column = 0; column < columns; column++) {
    const start = column * boardSize.width;
    const span = Math.min(boardSize.width, grid.width - start) * BEAD_CHART_CELL_SIZE;
    const value = `C${column + 1}`;
    if (textWidth(value, LABEL_SCALE) + SWATCH_GAP <= span)
      centered(
        value,
        chartLeft + start * BEAD_CHART_CELL_SIZE + span / 2,
        chartTop - ANNOTATIONS.boardColumnGap,
        LABEL_SCALE,
      );
  }
  for (let row = 0; row < rows; row++) {
    const start = row * boardSize.height;
    const span = Math.min(boardSize.height, grid.height - start) * BEAD_CHART_CELL_SIZE;
    label(
      `R${row + 1}`,
      chartLeft - AXIS_GUTTER,
      Math.round(chartTop + start * BEAD_CHART_CELL_SIZE + span / 2 - ANNOTATIONS.boardRowBaseline),
    );
  }
  rectangle(
    MARGIN,
    legendTop - ANNOTATIONS.separatorGap,
    width - MARGIN * 2,
    ANNOTATIONS.swatchBorder,
    LINE,
  );
  label(ANNOTATIONS.materials, MARGIN, legendTop, ANNOTATIONS.headingScale);
  const columnWidth = Math.floor((width - MARGIN * 2) / legendColumns);
  const usage = [...grid.usage].sort(
    (a, b) =>
      b.quantity - a.quantity || a.color.code.localeCompare(b.color.code, "en", { numeric: true }),
  );
  for (const [index, { color, quantity }] of usage.entries()) {
    const x = MARGIN + (index % legendColumns) * columnWidth;
    const y =
      legendTop + LEGEND_HEADING_HEIGHT + Math.floor(index / legendColumns) * LEGEND_ROW_HEIGHT;
    rectangle(x, y, SWATCH_SIZE, SWATCH_SIZE, INK);
    rectangle(
      x + ANNOTATIONS.swatchBorder,
      y + ANNOTATIONS.swatchBorder,
      SWATCH_SIZE - ANNOTATIONS.swatchBorder * 2,
      SWATCH_SIZE - ANNOTATIONS.swatchBorder * 2,
      color.rgb,
    );
    const codeX = x + SWATCH_SIZE + SWATCH_GAP;
    label(color.code, codeX, y, ANNOTATIONS.headingScale);
    const countX = codeX + textWidth(color.code, ANNOTATIONS.headingScale) + SWATCH_GAP;
    label(`X${quantity}`, countX, y, ANNOTATIONS.headingScale);
    if (color.name.toUpperCase() !== color.code.toUpperCase()) {
      const nameWidth = columnWidth - SWATCH_SIZE - SWATCH_GAP * 2;
      let name = color.name;
      while (name.length && textWidth(name, COORDINATE_SCALE) > nameWidth) name = name.slice(0, -1);
      label(name, x + SWATCH_SIZE + SWATCH_GAP, y + ANNOTATIONS.colorNameOffset, COORDINATE_SCALE);
    }
  }
  if (attribution) {
    const { footerTop } = layout;
    rectangle(MARGIN, footerTop, width - MARGIN * 2, ANNOTATIONS.swatchBorder, LINE);
    const image = (pixels: PixelBuffer, left: number, top: number, scale: number) =>
      exportImageRuns(pixels, (x, y, runWidth, rgb) =>
        rectangle(left + x * scale, top + y * scale, runWidth * scale, scale, rgb),
      );
    const qr = qrCodePixels(attribution.url, QR_SCALE);
    image(
      attribution.signature,
      MARGIN,
      footerTop + FOOTER_IMAGE_TOP + Math.floor((qr.height - attribution.signature.height) / 2),
      1,
    );
    image(qr, width - MARGIN - qr.width, footerTop + FOOTER_IMAGE_TOP, 1);
  }
  return sheet;
}
