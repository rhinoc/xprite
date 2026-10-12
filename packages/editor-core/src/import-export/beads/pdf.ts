import { beadTextInk } from "$/import-export/beads/chart";
import {
  beadBoards,
  EMPTY_BEAD_CELL,
  type BeadGrid,
  type BeadBoard,
  type BeadBoardSize,
} from "$/import-export/beads/grid";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 42;
const CHART_TOP = 744;
const CHART_BOTTOM = 70;
const LINE_HEIGHT = 20;
const MAX_BOARD_PAGES = 1024;

function number(value: number) {
  return Number(value.toFixed(3)).toString();
}
function literal(value: string) {
  return value.replace(/[^\x20-\x7e]/g, "?").replace(/[\\()]/g, "\\$&");
}
function text(value: string, x: number, y: number, size = 11) {
  return `BT /F1 ${number(size)} Tf ${number(x)} ${number(y)} Td (${literal(value)}) Tj ET\n`;
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
    (PAGE_WIDTH - MARGIN * 2) / area.width,
    (CHART_TOP - CHART_BOTTOM) / area.height,
  );
  const left = (PAGE_WIDTH - area.width * size) / 2;
  let output = "";
  for (let y = 0; y < area.height; y++)
    for (let x = 0; x < area.width; x++) {
      const index = grid.cells[(area.y + y) * grid.width + area.x + x];
      if (index === EMPTY_BEAD_CELL) continue;
      const item = grid.colors[index];
      const px = left + x * size,
        py = CHART_TOP - (y + 1) * size;
      output += `${color(item.rgb)} rg ${number(px)} ${number(py)} ${number(size)} ${number(size)} re f\n`;
      if (showCodes) {
        const fontSize = Math.min(9, size * 0.55, (size - 1) / (item.code.length * 0.67));
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
    output += `${number(left + x * size)} ${CHART_TOP} m ${number(left + x * size)} ${number(CHART_TOP - area.height * size)} l S\n`;
  for (let y = 0; y <= area.height; y += rowStep)
    output += `${number(left)} ${number(CHART_TOP - y * size)} m ${number(left + area.width * size)} ${number(CHART_TOP - y * size)} l S\n`;
  output += `0 G 0.5 w ${number(left)} ${number(CHART_TOP - area.height * size)} ${number(area.width * size)} ${number(area.height * size)} re S\n`;
  return output;
}

/** Portable A4 vector PDF: overview, row-major boards, then a paginated material list. */
export function encodeBeadPdf(
  grid: BeadGrid,
  brand: string,
  boardSize: BeadBoardSize,
  showCodes: boolean,
): Uint8Array {
  const boards = beadBoards(grid, boardSize);
  if (boards.length > MAX_BOARD_PAGES)
    throw new Error("Too many bead boards. Choose a larger board size.");
  const pages: string[] = [];
  const heading = (title: string, detail: string) =>
    "0 g\n" +
    text(title, MARGIN, PAGE_HEIGHT - MARGIN, 16) +
    text(detail, MARGIN, PAGE_HEIGHT - MARGIN - 24);
  pages.push(
    heading(
      `${brand} - overview`,
      `${grid.width} x ${grid.height} beads | ${boards.length} boards | ${grid.total} beads | ${grid.usage.length} colors`,
    ) + chart(grid, { x: 0, y: 0, width: grid.width, height: grid.height }, false, boardSize, true),
  );
  for (const board of boards) {
    pages.push(
      heading(
        `${brand} - board row ${board.row + 1}, column ${board.column + 1}`,
        `Columns ${board.x + 1}-${board.x + board.width}, rows ${board.y + 1}-${board.y + board.height} | board ${boardSize.width} x ${boardSize.height}`,
      ) + chart(grid, board, showCodes, boardSize),
    );
  }
  let list =
    heading(`${brand} - materials`, `Total: ${grid.total} beads | ${grid.usage.length} colors`) +
    text("Code", MARGIN + 26, CHART_TOP) +
    text("Color", MARGIN + 142, CHART_TOP) +
    text("Quantity", PAGE_WIDTH - MARGIN - 62, CHART_TOP);
  let lineY = CHART_TOP - LINE_HEIGHT;
  for (const { color: item, quantity } of grid.usage) {
    if (lineY < CHART_BOTTOM) {
      pages.push(list);
      list = heading(`${brand} - materials (continued)`, `Total: ${grid.total} beads`);
      lineY = CHART_TOP;
    }
    list +=
      `${color(item.rgb)} rg ${MARGIN} ${lineY - 2} 14 14 re f\n0 g\n` +
      text(item.code, MARGIN + 26, lineY) +
      text(item.name.slice(0, 40), MARGIN + 142, lineY, 9) +
      text(String(quantity), PAGE_WIDTH - MARGIN - 62, lineY);
    lineY -= LINE_HEIGHT;
  }
  pages.push(list);
  const objects = [
    "",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const pageIds: number[] = [];
  for (let index = 0; index < pages.length; index++) {
    const content =
      pages[index] +
      "0 g\n" +
      text(`${index + 1} / ${pages.length}`, PAGE_WIDTH - MARGIN - 60, 30, 9);
    const pageId = objects.length,
      contentId = pageId + 1;
    pageIds.push(pageId);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
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
