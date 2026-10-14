/** Every human-readable string printed into PNG and PDF bead artifacts. */
export interface BeadDocumentLabels {
  sheetTitle: string;
  sheetMaterials: string;
  summary(values: {
    width: number;
    height: number;
    beads: number;
    colors: number;
    boards: number;
  }): string;
  boardLayout(values: {
    boardWidth: number;
    boardHeight: number;
    rows: number;
    columns: number;
  }): string;
  overview(values: { brand: string }): string;
  boardPage(values: {
    brand: string;
    index: number;
    count: number;
    row: number;
    column: number;
  }): string;
  boardRange(values: {
    firstColumn: number;
    lastColumn: number;
    firstRow: number;
    lastRow: number;
    boardWidth: number;
    boardHeight: number;
  }): string;
  materials(values: { brand: string }): string;
  materialsContinued(values: { brand: string }): string;
  total(values: { beads: number; colors: number }): string;
  code: string;
  color: string;
  quantity: string;
}

/** Fallback labels; the bitmap glyph font only covers uppercase ASCII for PNG sheets. */
export const ENGLISH_BEAD_LABELS: BeadDocumentLabels = {
  sheetTitle: "FUSE BEAD PATTERN",
  sheetMaterials: "MATERIALS - CODE / COLOR / QUANTITY",
  summary: ({ width, height, beads, colors, boards }) =>
    `${width} X ${height} | BEADS ${beads} | COLORS ${colors} | BOARDS ${boards}`,
  boardLayout: ({ boardWidth, boardHeight, rows, columns }) =>
    `BOARD ${boardWidth} X ${boardHeight} | ${rows} ROWS X ${columns} COLUMNS`,
  overview: ({ brand }) => `${brand} - overview`,
  boardPage: ({ brand, index, count, row, column }) =>
    `${brand} - B${index}/${count}: board row ${row}, column ${column}`,
  boardRange: ({ firstColumn, lastColumn, firstRow, lastRow, boardWidth, boardHeight }) =>
    `Columns ${firstColumn}-${lastColumn}, rows ${firstRow}-${lastRow} | board ${boardWidth} x ${boardHeight}`,
  materials: ({ brand }) => `${brand} - materials`,
  materialsContinued: ({ brand }) => `${brand} - materials (continued)`,
  total: ({ beads, colors }) => `Total: ${beads} beads | ${colors} colors`,
  code: "Code",
  color: "Color",
  quantity: "Quantity",
};
