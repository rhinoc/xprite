import type { BeadPreviewLayout } from "$/managers/beads/bead-tool-manager";

import styles from "$/components/beads/beads.module.css";

const MIN_CELL_SPACING = 4;

/**
 * Grid guides over the pattern layer, drawn at screen resolution so a fitted chart retains every
 * visible line. `size` is the layer's on-screen size: the pattern is stretched over the original's
 * box, so each bead is `size / columns` wide and `size / rows` tall.
 */
export function BeadPreviewGrid({
  layout,
  size,
}: {
  layout: BeadPreviewLayout;
  size: { width: number; height: number };
}) {
  const stepX = size.width / layout.columns;
  const stepY = size.height / layout.rows;
  const showCells = Math.min(stepX, stepY) >= MIN_CELL_SPACING;
  const columns = Array.from({ length: layout.columns + 1 }, (_, index) => index);
  const rows = Array.from({ length: layout.rows + 1 }, (_, index) => index);
  return (
    <svg
      className={styles.previewGrid}
      aria-hidden="true"
      viewBox={`0 0 ${size.width} ${size.height}`}
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
            x1={column * stepX}
            x2={column * stepX}
            y1={0}
            y2={size.height}
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
            y1={row * stepY}
            y2={row * stepY}
            x1={0}
            x2={size.width}
          />
        ) : null;
      })}
    </svg>
  );
}
