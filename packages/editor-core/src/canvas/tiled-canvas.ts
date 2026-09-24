import type { Point, Rect } from "$/base/primitives";
export type TiledMode = 0 | 1 | 2 | 3;
export interface TiledRasterOptions {
  mode: TiledMode;
  width: number;
  height: number;
  origin: Point;
}
const modulo = (n: number, period: number) => ((n % period) + period) % period;
/** Coordinates enter/leave in cel-image space; wrapping happens in sprite space,
 * before mask clipping, ink lookup, coverage and undo dirty observation. */
export function projectTiledPixel(x: number, y: number, tiled?: TiledRasterOptions): Point {
  if (!tiled || !tiled.mode) return { x, y };
  return {
    x: tiled.mode & 1 ? modulo(x + tiled.origin.x, tiled.width) - tiled.origin.x : x,
    y: tiled.mode & 2 ? modulo(y + tiled.origin.y, tiled.height) - tiled.origin.y : y,
  };
}
/** LibreSprite's tiled editor view draws one central tile and its neighbours. */
export function tiledCanvasLayout(width: number, height: number, mode: TiledMode) {
  const x = !!(mode & 1),
    y = !!(mode & 2);
  return {
    width: width * (x ? 3 : 1),
    height: height * (y ? 3 : 1),
    mainTile: { x: x ? width : 0, y: y ? height : 0 },
    tiles: Array.from({ length: y ? 3 : 1 }, (_, row) =>
      Array.from({ length: x ? 3 : 1 }, (_, col) => ({
        x: col * width,
        y: row * height,
        width,
        height,
      })),
    ).flat(),
  };
}
/** Enumerate tile copies intersecting a document-space stroke/dirty rectangle;
 * images are never duplicated into the document timeline. */
export function tiledRegionCopies(
  rect: Rect,
  width: number,
  height: number,
  mode: TiledMode,
): Rect[] {
  return tiledCanvasLayout(width, height, mode).tiles.map((tile) => ({
    ...rect,
    x: rect.x + tile.x,
    y: rect.y + tile.y,
  }));
}
