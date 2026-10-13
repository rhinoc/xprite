import type { BeadPreviewLayout } from "$/managers/beads/bead-tool-manager";

import styles from "$/components/beads/beads.module.css";

const MIN_CELL_SPACING = 4;

/** Draw grid guides at screen resolution so a fitted chart retains every visible line. */
export function BeadPreviewGrid({
  layout,
  view,
}: {
  layout: BeadPreviewLayout;
  view: {
    zoom: number;
    origin: { x: number; y: number };
    size: { width: number; height: number };
  };
}) {
  const step = layout.cellSize * view.zoom;
  const showCells = step >= MIN_CELL_SPACING;
  const { x, y } = view.origin;
  const columns = Array.from({ length: layout.columns + 1 }, (_, index) => index);
  const rows = Array.from({ length: layout.rows + 1 }, (_, index) => index);
  return (
    <svg
      className={styles.previewGrid}
      aria-hidden="true"
      viewBox={`0 0 ${view.size.width} ${view.size.height}`}
    >
      {columns.map((column) => {
        const boundary =
          column === 0 ||
          column === layout.columns ||
          (layout.offsetX + column) % layout.boardSize.width === 0;
        return showCells || boundary ? (
          <line
            key={`x-${column}`}
            className={boundary ? styles.boardLine : styles.gridLine}
            x1={x + column * step}
            x2={x + column * step}
            y1={y}
            y2={y + layout.rows * step}
          />
        ) : null;
      })}
      {rows.map((row) => {
        const boundary =
          row === 0 ||
          row === layout.rows ||
          (layout.offsetY + row) % layout.boardSize.height === 0;
        return showCells || boundary ? (
          <line
            key={`y-${row}`}
            className={boundary ? styles.boardLine : styles.gridLine}
            y1={y + row * step}
            y2={y + row * step}
            x1={x}
            x2={x + layout.columns * step}
          />
        ) : null;
      })}
    </svg>
  );
}
