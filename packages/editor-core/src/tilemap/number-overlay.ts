import type { TilemapImage } from "$/tilemap/model";
import { TILE_DIAGONAL_FLIP, TILE_INDEX_MASK, TILE_X_FLIP, TILE_Y_FLIP } from "$/tilemap/model";

export interface TileNumberLabel {
  x: number;
  y: number;
  number: string;
  flags: string;
}

interface CellRange {
  start: number;
  end: number;
}

function visibleCellRange(
  viewportStart: number,
  viewportLength: number,
  cellOrigin: number,
  cellSize: number,
  cellCount: number,
): CellRange {
  return {
    start: Math.max(0, Math.floor((viewportStart - cellOrigin) / cellSize)),
    end: Math.min(cellCount, Math.ceil((viewportStart + viewportLength - cellOrigin) / cellSize)),
  };
}

/** Build annotations for occupied grid cells that intersect the viewport. */
export function tileNumberLabels(
  map: TilemapImage,
  baseIndex: number,
  celX: number,
  celY: number,
  tileWidth: number,
  tileHeight: number,
  visible: { x: number; y: number; width: number; height: number },
): TileNumberLabel[] {
  const columns = visibleCellRange(visible.x, visible.width, celX, tileWidth, map.width);
  const rows = visibleCellRange(visible.y, visible.height, celY, tileHeight, map.height);
  const labels: TileNumberLabel[] = [];

  for (let y = rows.start; y < rows.end; y++) {
    for (let x = columns.start; x < columns.end; x++) {
      const tile = map.tiles[y * map.width + x] >>> 0;
      const index = tile & TILE_INDEX_MASK;
      if (index === 0) continue;
      labels.push({
        x: celX + x * tileWidth,
        y: celY + y * tileHeight,
        number: String(index + baseIndex - 1),
        flags: `${tile & TILE_X_FLIP ? "X" : ""}${tile & TILE_Y_FLIP ? "Y" : ""}${tile & TILE_DIAGONAL_FLIP ? "D" : ""}`,
      });
    }
  }
  return labels;
}
