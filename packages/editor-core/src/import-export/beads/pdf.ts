import type { PixelBuffer } from "$/base";
import {
  exportImageRuns,
  type ExportAttribution,
  type ExportRasterText,
} from "$/import-export/attribution";
import { beadTextInk } from "$/import-export/beads/chart";
import {
  assertBeadBoardCount,
  beadBoards,
  EMPTY_BEAD_CELL,
  type BeadGrid,
  type BeadBoard,
  type BeadBoardSize,
} from "$/import-export/beads/grid";
import { ENGLISH_BEAD_LABELS, type BeadDocumentLabels } from "$/import-export/beads/labels";
import { qrCodePixels } from "$/import-export/qr-code";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 42;
const CHART_TOP = 744;
const CHART_BOTTOM = 70;
const LINE_HEIGHT = 20;
const AXIS_GUTTER = 20;
const AXIS_FONT_SIZE = 8;
const AXIS_GAP = 4;
const BOARD_LABEL_FONT_SIZE = 10;
const FOOTER_RULE_Y = 62;
const FOOTER_QR_SIZE = 44;
const FOOTER_QR_Y = 10;
const PAGE_NUMBER_Y = 30;
const PAGE_NUMBER_FONT_SIZE = 9;
const CHARACTER_WIDTH_RATIO = 0.56;

function attributionFooter(attribution: ExportAttribution): string {
  let output = `0.65 G 0.3 w ${MARGIN} ${FOOTER_RULE_Y} m ${PAGE_WIDTH - MARGIN} ${FOOTER_RULE_Y} l S\n`;
  const image = (pixels: PixelBuffer, left: number, bottom: number, size: number) => {
    const scale = size / pixels.width;
    exportImageRuns(pixels, (x, y, width, rgb) => {
      output += `${color(rgb)} rg ${number(left + x * scale)} ${number(bottom + (pixels.height - y - 1) * scale)} ${number(width * scale)} ${number(scale)} re f\n`;
    });
  };
  image(
    attribution.signature,
    MARGIN,
    Math.round(FOOTER_QR_Y + (FOOTER_QR_SIZE - attribution.signature.height) / 2),
    attribution.signature.width,
  );
  image(
    qrCodePixels(attribution.url, 1),
    PAGE_WIDTH - MARGIN - FOOTER_QR_SIZE,
    FOOTER_QR_Y,
    FOOTER_QR_SIZE,
  );
  return output;
}

function ticks(length: number, step: number): number[] {
  const result = [];
  for (let index = 0; index < length; index += step) result.push(index);
  const last = length - 1;
  if (result[result.length - 1] !== last) {
    if (result.length > 1 && last - result[result.length - 1] < step) result.pop();
    result.push(last);
  }
  return result;
}

function number(value: number) {
  return Number(value.toFixed(3)).toString();
}
function literal(value: string) {
  return value.replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, "\\$&");
}
function text(value: string, x: number, y: number, size = 11) {
  return `BT /F1 ${number(size)} Tf ${number(x)} ${number(y)} Td (${literal(value)}) Tj ET\n`;
}
const RASTER_TEXT_SCALE = 4;
const CHANNELS = 4;
const OPAQUE = 255;
const PDF_SAFE_TEXT = /^[\x20-\x7e]*$/;

/**
 * Helvetica covers printable ASCII only. Localized labels in other scripts are drawn as
 * vector runs of rasterized text, so every language prints without embedding a font.
 */
function localizedText(rasterText: ExportRasterText | undefined) {
  return (value: string, x: number, y: number, size = 11) => {
    if (!rasterText || PDF_SAFE_TEXT.test(value)) return text(value, x, y, size);
    const fontSize = size * RASTER_TEXT_SCALE;
    const bounds = rasterText.measure(value, fontSize);
    const pixels = {
      width: bounds.width,
      height: bounds.height,
      data: new Uint8ClampedArray(bounds.width * bounds.height * CHANNELS).fill(OPAQUE),
    };
    rasterText.draw(pixels, value, 0, 0, fontSize, [0, 0, 0]);
    const unit = 1 / RASTER_TEXT_SCALE;
    // Align the raster box with the Helvetica baseline used for ASCII labels.
    const bottom = y - size * 0.25;
    let output = "";
    exportImageRuns(pixels, (column, row, width, rgb) => {
      output += `${color(rgb)} rg ${number(x + column * unit)} ${number(bottom + (pixels.height - row - 1) * unit)} ${number(width * unit)} ${number(unit)} re f\n`;
    });
    return output + "0 g\n";
  };
}

function color(rgb: readonly [number, number, number]) {
  return rgb.map((value) => number(value / 255)).join(" ");
}

function chart(
  grid: BeadGrid,
  area: Pick<BeadBoard, "x" | "y" | "width" | "height">,
  showCodes: boolean,
  boardSize: BeadBoardSize,
  overview = false,
) {
  const size = Math.min(
    (PAGE_WIDTH - (MARGIN + AXIS_GUTTER) * 2) / area.width,
    (CHART_TOP - CHART_BOTTOM - AXIS_GUTTER * 2) / area.height,
  );
  const left = (PAGE_WIDTH - area.width * size) / 2;
  const top = CHART_TOP - AXIS_GUTTER;
  let output = "";
  for (let y = 0; y < area.height; y++)
    for (let x = 0; x < area.width; x++) {
      const index = grid.cells[(area.y + y) * grid.width + area.x + x];
      if (index === EMPTY_BEAD_CELL) continue;
      const item = grid.colors[index];
      const px = left + x * size,
        py = top - (y + 1) * size;
      output += `${color(item.rgb)} rg ${number(px)} ${number(py)} ${number(size)} ${number(size)} re f\n`;
      if (showCodes) {
        const fontSize = Math.min(
          9,
          size * 0.55,
          (size - Math.min(1, size * 0.1)) / (item.code.length * 0.67),
        );
        const ink = beadTextInk(item.rgb) / 255;
        output +=
          `${ink} g ` +
          text(
            item.code,
            px + (size - item.code.length * fontSize * 0.56) / 2,
            py + (size - fontSize) / 2,
            fontSize,
          );
      }
    }
  output += "0.65 G 0.3 w\n";
  // Overview uses board boundaries; individual boards include every cell boundary.
  const columnStep = overview ? boardSize.width : 1;
  const rowStep = overview ? boardSize.height : 1;
  for (let x = 0; x <= area.width; x += columnStep)
    output += `${number(left + x * size)} ${number(top)} m ${number(left + x * size)} ${number(top - area.height * size)} l S\n`;
  for (let y = 0; y <= area.height; y += rowStep)
    output += `${number(left)} ${number(top - y * size)} m ${number(left + area.width * size)} ${number(top - y * size)} l S\n`;
  output += `0 G 0.5 w ${number(left)} ${number(top - area.height * size)} ${number(area.width * size)} ${number(area.height * size)} re S\n0 g\n`;
  const coordinateWidth = String(area.x + area.width).length * AXIS_FONT_SIZE * 0.56;
  for (const x of ticks(area.width, Math.max(1, Math.ceil((coordinateWidth + AXIS_GAP) / size)))) {
    const value = String(area.x + x + 1);
    const center = left + (x + 0.5) * size;
    const labelX = center - value.length * AXIS_FONT_SIZE * 0.28;
    output += text(value, labelX, top + AXIS_GAP, AXIS_FONT_SIZE);
    output += text(
      value,
      labelX,
      top - area.height * size - AXIS_FONT_SIZE - AXIS_GAP,
      AXIS_FONT_SIZE,
    );
  }
  for (const y of ticks(area.height, Math.max(1, Math.ceil((AXIS_FONT_SIZE + AXIS_GAP) / size)))) {
    const value = String(area.y + y + 1);
    const labelY = top - (y + 0.5) * size - AXIS_FONT_SIZE * 0.3;
    output += text(
      value,
      left - AXIS_GAP - value.length * AXIS_FONT_SIZE * 0.56,
      labelY,
      AXIS_FONT_SIZE,
    );
    output += text(value, left + area.width * size + AXIS_GAP, labelY, AXIS_FONT_SIZE);
  }
  if (overview) {
    for (const [index, board] of beadBoards(grid, boardSize).entries()) {
      const value = `B${index + 1}`;
      const fontSize = Math.min(
        BOARD_LABEL_FONT_SIZE,
        (board.width * size * 0.7) / (value.length * 0.56),
        board.height * size * 0.5,
      );
      const labelWidth = value.length * fontSize * 0.56;
      const padding = Math.min(AXIS_GAP, board.width * size * 0.1, board.height * size * 0.1);
      const x = left + (board.x + board.width / 2) * size - labelWidth / 2;
      const y = top - (board.y + board.height / 2) * size - fontSize / 2;
      output += `1 g ${number(x - padding)} ${number(y - padding)} ${number(labelWidth + padding * 2)} ${number(fontSize + padding * 2)} re f\n0 g\n`;
      output += text(value, x, y, fontSize);
    }
  }
  return output;
}

export interface BeadPdfOptions {
  attribution?: ExportAttribution;
  labels?: BeadDocumentLabels;
  rasterText?: ExportRasterText;
}

/** Pages are produced lazily so the async encoder can yield between boards. */
function* beadPdfPages(
  grid: BeadGrid,
  brand: string,
  boardSize: BeadBoardSize,
  showCodes: boolean,
  { labels = ENGLISH_BEAD_LABELS, rasterText }: BeadPdfOptions,
): Generator<string, void, undefined> {
  const boards = beadBoards(grid, boardSize);
  const label = localizedText(rasterText);
  const pending: string[] = [];
  const heading = (title: string, detail: string) =>
    "0 g\n" +
    label(title, MARGIN, PAGE_HEIGHT - MARGIN, 16) +
    label(detail, MARGIN, PAGE_HEIGHT - MARGIN - 24);
  pending.push(
    heading(
      labels.overview({ brand }),
      labels.summary({
        width: grid.width,
        height: grid.height,
        beads: grid.total,
        colors: grid.usage.length,
        boards: boards.length,
      }),
    ) + chart(grid, { x: 0, y: 0, width: grid.width, height: grid.height }, false, boardSize, true),
  );
  yield* pending.splice(0);
  for (const [index, board] of boards.entries()) {
    pending.push(
      heading(
        labels.boardPage({
          brand,
          index: index + 1,
          count: boards.length,
          row: board.row + 1,
          column: board.column + 1,
        }),
        labels.boardRange({
          firstColumn: board.x + 1,
          lastColumn: board.x + board.width,
          firstRow: board.y + 1,
          lastRow: board.y + board.height,
          boardWidth: boardSize.width,
          boardHeight: boardSize.height,
        }),
      ) + chart(grid, board, showCodes, boardSize),
    );
    yield* pending.splice(0);
  }
  const materialHeading = (continued = false) =>
    heading(
      (continued ? labels.materialsContinued : labels.materials)({ brand }),
      labels.total({ beads: grid.total, colors: grid.usage.length }),
    ) +
    label(labels.code, MARGIN + 26, CHART_TOP) +
    label(labels.color, MARGIN + 142, CHART_TOP) +
    label(labels.quantity, PAGE_WIDTH - MARGIN - 62, CHART_TOP);
  let list = materialHeading();
  let lineY = CHART_TOP - LINE_HEIGHT;
  for (const { color: item, quantity } of [...grid.usage].sort(
    (a, b) =>
      b.quantity - a.quantity || a.color.code.localeCompare(b.color.code, "en", { numeric: true }),
  )) {
    if (lineY < CHART_BOTTOM) {
      pending.push(list);
      list = materialHeading(true);
      lineY = CHART_TOP - LINE_HEIGHT;
    }
    list +=
      `${color(item.rgb)} rg ${MARGIN} ${lineY - 2} 14 14 re f\n0 g\n` +
      text(item.code, MARGIN + 26, lineY) +
      label(item.name.slice(0, 40), MARGIN + 142, lineY, 9) +
      text(String(quantity), PAGE_WIDTH - MARGIN - 62, lineY);
    lineY -= LINE_HEIGHT;
  }
  pending.push(list);
  yield* pending.splice(0);
}

/** Number of pages before the material list: one overview plus one page per board. */
export function beadPdfChartPageCount(grid: BeadGrid, boardSize: BeadBoardSize): number {
  return beadBoards(grid, boardSize).length + 1;
}

function assembleBeadPdf(pages: readonly string[], attribution?: ExportAttribution): Uint8Array {
  const objects = [
    "",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const pageIds: number[] = [];
  const footer = attribution ? attributionFooter(attribution) : "";
  for (let index = 0; index < pages.length; index++) {
    const pageNumber = `${index + 1} / ${pages.length}`;
    const content =
      pages[index] +
      footer +
      "0 g\n" +
      text(
        pageNumber,
        (PAGE_WIDTH - pageNumber.length * PAGE_NUMBER_FONT_SIZE * CHARACTER_WIDTH_RATIO) / 2,
        PAGE_NUMBER_Y,
        PAGE_NUMBER_FONT_SIZE,
      );
    const pageId = objects.length,
      contentId = pageId + 1;
    const annotationId = contentId + 1;
    pageIds.push(pageId);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R${attribution ? ` /Annots [${annotationId} 0 R]` : ""} >>`,
    );
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
    if (attribution)
      objects.push(
        `<< /Type /Annot /Subtype /Link /Rect [${MARGIN} ${FOOTER_QR_Y} ${PAGE_WIDTH / 2 - MARGIN} ${FOOTER_RULE_Y}] /Border [0 0 0] /A << /S /URI /URI (${literal(attribution.url)}) >> >>`,
      );
  }
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets.push(output.length);
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = output.length;
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(output, (character) => character.charCodeAt(0));
}

/** Portable A4 vector PDF: overview, row-major boards, then a paginated material list. */
export function encodeBeadPdf(
  grid: BeadGrid,
  brand: string,
  boardSize: BeadBoardSize,
  showCodes: boolean,
  options: BeadPdfOptions = {},
): Uint8Array {
  assertBeadBoardCount(grid, boardSize);
  return assembleBeadPdf(
    [...beadPdfPages(grid, brand, boardSize, showCodes, options)],
    options.attribution,
  );
}

const PDF_YIELD_PAGES = 8;

/** Same bytes as encodeBeadPdf, yielding to the UI between pages and reporting progress 0..1. */
export async function encodeBeadPdfAsync(
  grid: BeadGrid,
  brand: string,
  boardSize: BeadBoardSize,
  showCodes: boolean,
  options: BeadPdfOptions & {
    onProgress?: (progress: number) => void;
    /** Host scheduler hook, e.g. a macrotask in browsers; resolves immediately by default. */
    yieldToHost?: () => Promise<void>;
  } = {},
): Promise<Uint8Array> {
  assertBeadBoardCount(grid, boardSize);
  const expected = beadPdfChartPageCount(grid, boardSize);
  const pause = options.yieldToHost ?? (() => Promise.resolve());
  const pages: string[] = [];
  for (const page of beadPdfPages(grid, brand, boardSize, showCodes, options)) {
    pages.push(page);
    if (pages.length % PDF_YIELD_PAGES === 0) {
      options.onProgress?.(Math.min(1, pages.length / expected));
      await pause();
    }
  }
  const bytes = assembleBeadPdf(pages, options.attribution);
  options.onProgress?.(1);
  return bytes;
}
