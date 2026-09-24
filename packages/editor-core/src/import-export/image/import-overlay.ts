import type { Point, Rect } from "$/base/primitives";
import type { ImportSpriteSheetOptions } from "$/import-export/image/import-sprite-sheet";

export type ImportSheetRuler = 0 | 1 | 2 | 3 | 4 | 5;

export interface ImportSheetOverlayGeometry {
  shade: Rect[];
  grid: { from: Point; to: Point }[];
  rulers: number[];
  rulerGuides: { axis: "horizontal" | "vertical"; position: number }[];
}

type ImageSize = { width: number; height: number };
type Box = { x: number; y: number; width: number; height: number };

const right = (box: Box) => box.x + box.width;
const bottom = (box: Box) => box.y + box.height;

/** The four box boundaries are the usual GPLv2 selection-box ruler model.
 * Import adds two guides at the far edge of each configured tile gap. */
export function importSheetRulers(options: ImportSpriteSheetOptions): number[] {
  const horizontalGap = options.paddingEnabled ? options.horizontalPadding : 0;
  const verticalGap = options.paddingEnabled ? options.verticalPadding : 0;
  return [
    options.y,
    options.y + options.height,
    options.x,
    options.x + options.width,
    options.y + options.height + verticalGap,
    options.x + options.width + horizontalGap,
  ];
}

/** Padding rulers use narrow line targets. Clicking the first tile body moves
 * the whole tile definition, matching the import dialog's direct manipulation. */
export function hitImportSheetRulers(
  point: Point,
  options: ImportSpriteSheetOptions,
  tolerance: number,
): ImportSheetRuler[] {
  const rulers = importSheetRulers(options);
  const hit: ImportSheetRuler[] = [];
  for (let index = 0; index < rulers.length; index++) {
    const horizontal = index === 0 || index === 1 || index === 4;
    const coordinate = horizontal ? point.y : point.x;
    if (Math.abs(coordinate - rulers[index]) <= tolerance) hit.push(index as ImportSheetRuler);
  }

  if (hit.length) return hit;

  const inFirstTile =
    point.x >= options.x &&
    point.x < options.x + options.width &&
    point.y >= options.y &&
    point.y < options.y + options.height;
  return inFirstTile ? [0, 1, 2, 3, 4, 5] : [];
}

/** Counts whole repeated spans. Partial final frames remain visible in the
 * overlay but do not increase the source complete-span counters. */
export function importSheetOverlayCounts(image: ImageSize, options: ImportSpriteSheetOptions) {
  const count = (available: number, size: number, gap: number) =>
    Math.max(0, Math.floor((available + gap) / (Math.max(1, size) + gap)));
  const gapX = options.paddingEnabled ? options.horizontalPadding : 0;
  const gapY = options.paddingEnabled ? options.verticalPadding : 0;
  return {
    columns:
      options.layout === "vertical" ? 1 : count(image.width - options.x, options.width, gapX),
    rows:
      options.layout === "horizontal" ? 1 : count(image.height - options.y, options.height, gapY),
  };
}

/** Apply a pointer displacement to selected ruler coordinates. The basic
 * opposite-edge behavior follows LibreSprite's GPLv2 TwoPoints/selection
 * controller conventions; the two padding coordinates are import-specific. */
export function dragImportSheetRulers(
  image: ImageSize,
  original: ImportSpriteSheetOptions,
  moving: readonly ImportSheetRuler[],
  delta: Point,
  symmetric = false,
): ImportSpriteSheetOptions {
  const start = importSheetRulers(original);
  const position = [...start];

  for (const index of moving) {
    const verticalLine = index === 0 || index === 1 || index === 4;
    const shift = Math.trunc(verticalLine ? delta.y : delta.x);

    // Keep the configured gap attached to a moved lower/right tile edge.
    if (index === 1) position[4] = start[4] + shift;
    else if (index === 3) position[5] = start[5] + shift;

    position[index] = start[index] + shift;
    if (symmetric) position[index ^ 1] = start[index ^ 1] - shift;
  }

  const next: ImportSpriteSheetOptions = {
    ...original,
    x: Math.min(position[2], position[3]),
    y: Math.min(position[0], position[1]),
    width: Math.abs(position[3] - position[2]),
    height: Math.abs(position[1] - position[0]),
    horizontalPadding: original.paddingEnabled ? Math.max(0, position[5] - position[3]) : 0,
    verticalPadding: original.paddingEnabled ? Math.max(0, position[4] - position[1]) : 0,
  };
  return { ...next, ...importSheetOverlayCounts(image, next) };
}

function intersecting(box: Box, viewport: Box) {
  return (
    box.width > 0 &&
    box.height > 0 &&
    box.x < right(viewport) &&
    box.y < bottom(viewport) &&
    right(box) > viewport.x &&
    bottom(box) > viewport.y
  );
}

/** Add one source-ordered translucent band. Keeping the rectangles separate
 * preserves alpha where two independently described outside bands overlap. */
function appendBand(
  output: Rect[],
  viewport: Box,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const band = { x, y, width, height };
  if (intersecting(band, viewport)) output.push(band);
}

function repeatEdges(start: number, span: number, gap: number, extent: number) {
  const edges: number[] = [];
  const pitch = span + gap;
  for (let edge = start + span; edge <= extent; edge += pitch) edges.push(edge);
  return edges;
}

function appendOuterBands(
  shade: Rect[],
  viewport: Box,
  sprite: Box,
  tile: Box,
  horizontal: boolean,
  vertical: boolean,
) {
  if (tile.y > viewport.y)
    appendBand(shade, viewport, viewport.x, viewport.y, viewport.width, tile.y - viewport.y);
  if (tile.x > viewport.x)
    appendBand(shade, viewport, viewport.x, tile.y, tile.x - viewport.x, bottom(viewport) - tile.y);

  if (!horizontal && !vertical) return;

  // An enabled repeat axis extends to the sprite edge on that axis. On a
  // disabled axis the dark region begins immediately after the first tile.
  const sheetRight = horizontal ? right(sprite) : right(tile);
  const sheetBottom = vertical ? bottom(sprite) : bottom(tile);
  if (sheetBottom < bottom(viewport))
    appendBand(
      shade,
      viewport,
      tile.x,
      sheetBottom,
      right(viewport) - tile.x,
      bottom(viewport) - sheetBottom,
    );
  if (sheetRight < right(viewport))
    appendBand(
      shade,
      viewport,
      sheetRight,
      tile.y,
      right(viewport) - sheetRight,
      sheetBottom - tile.y,
    );
}

function appendTwoAxisBands(
  shade: Rect[],
  viewport: Box,
  sprite: Box,
  tile: Box,
  xEdges: readonly number[],
  yEdges: readonly number[],
  gapX: number,
  gapY: number,
  zoom: number,
  partialTiles: boolean,
) {
  const canSeeGapX = gapX * zoom >= 1;
  const canSeeGapY = gapY * zoom >= 1;

  // Vertical gaps repeat for every frame row.
  if (canSeeGapX) {
    for (const x of xEdges)
      appendBand(
        shade,
        viewport,
        x,
        tile.y,
        Math.min(gapX, sprite.width - x),
        sprite.height - tile.y,
      );
  }

  // Horizontal gaps are split at each frame column so their rectangles follow
  // the underlying tile pitch and retain the original translucent overlaps.
  if (canSeeGapY) {
    for (const y of yEdges) {
      for (const x of xEdges) {
        if (x >= viewport.x && x - tile.width < right(viewport))
          appendBand(
            shade,
            viewport,
            x - tile.width,
            y,
            tile.width,
            Math.min(gapY, sprite.height - y),
          );
      }
      const finalX = xEdges[xEdges.length - 1];
      if (finalX !== undefined && finalX + gapX < sprite.width)
        appendBand(
          shade,
          viewport,
          finalX + gapX,
          y,
          sprite.width - finalX - gapX,
          Math.min(gapY, sprite.height - y),
        );
    }
  }

  if (partialTiles || !xEdges.length || !yEdges.length) return;

  const finalX = xEdges[xEdges.length - 1] + gapX;
  const finalY = yEdges[yEdges.length - 1] + gapY;
  if (finalX < sprite.width) {
    for (const y of yEdges)
      appendBand(shade, viewport, finalX, y - tile.height, sprite.width - finalX, tile.height);
    if (finalY < sprite.height)
      appendBand(shade, viewport, finalX, finalY, sprite.width - finalX, sprite.height - finalY);
  }
  if (finalY < sprite.height) {
    for (const x of xEdges)
      appendBand(shade, viewport, x - tile.width, finalY, tile.width, sprite.height - finalY);
  }
}

function appendSingleAxisBands(
  shade: Rect[],
  viewport: Box,
  sprite: Box,
  tile: Box,
  edges: readonly number[],
  gap: number,
  zoom: number,
  horizontal: boolean,
  partialTiles: boolean,
) {
  if (gap * zoom >= 1) {
    for (const edge of edges) {
      const width = horizontal ? Math.min(gap, sprite.width - edge) : tile.width;
      const height = horizontal ? tile.height : Math.min(gap, sprite.height - edge);
      appendBand(
        shade,
        viewport,
        horizontal ? edge : tile.x,
        horizontal ? tile.y : edge,
        width,
        height,
      );
    }
  }

  const finalEdge = edges[edges.length - 1];
  if (
    partialTiles ||
    finalEdge === undefined ||
    finalEdge <= 0 ||
    finalEdge + gap >= (horizontal ? sprite.width : sprite.height)
  )
    return;

  if (horizontal)
    appendBand(
      shade,
      viewport,
      finalEdge + gap,
      tile.y,
      sprite.width - finalEdge - gap,
      tile.height,
    );
  else
    appendBand(
      shade,
      viewport,
      tile.x,
      finalEdge + gap,
      tile.width,
      sprite.height - finalEdge - gap,
    );
}

/** Construct overlay bands from the tile pitch and sheet bounds. This keeps
 * the original paint order while describing each region as project geometry. */
export function importSheetOverlayGeometry(
  image: ImageSize,
  options: ImportSpriteSheetOptions,
  viewport: Rect,
  zoom = 1,
): ImportSheetOverlayGeometry {
  const tile = { x: options.x, y: options.y, width: options.width, height: options.height };
  const sprite = { x: 0, y: 0, width: image.width, height: image.height };
  const gapX = options.paddingEnabled ? Math.max(0, options.horizontalPadding) : 0;
  const gapY = options.paddingEnabled ? Math.max(0, options.verticalPadding) : 0;
  const horizontal = options.layout !== "vertical";
  const vertical = options.layout !== "horizontal";
  const shade: Rect[] = [];
  const grid: { from: Point; to: Point }[] = [];

  appendOuterBands(shade, viewport, sprite, tile, horizontal, vertical);

  const xEdges =
    horizontal && tile.width > 0 ? repeatEdges(tile.x, tile.width, gapX, image.width) : [];
  const yEdges =
    vertical && tile.height > 0 ? repeatEdges(tile.y, tile.height, gapY, image.height) : [];

  if (horizontal && vertical) {
    appendTwoAxisBands(
      shade,
      viewport,
      sprite,
      tile,
      xEdges,
      yEdges,
      gapX,
      gapY,
      zoom,
      options.partialTiles,
    );
  } else if (horizontal) {
    appendSingleAxisBands(
      shade,
      viewport,
      sprite,
      tile,
      xEdges,
      gapX,
      zoom,
      true,
      options.partialTiles,
    );
  } else if (vertical) {
    appendSingleAxisBands(
      shade,
      viewport,
      sprite,
      tile,
      yEdges,
      gapY,
      zoom,
      false,
      options.partialTiles,
    );
  }

  if (horizontal && gapX === 0) {
    const endY = vertical ? image.height : bottom(tile);
    for (const x of xEdges) grid.push({ from: { x, y: tile.y }, to: { x, y: endY } });
  }
  if (vertical && gapY === 0) {
    const endX = horizontal ? image.width : right(tile);
    for (const y of yEdges) grid.push({ from: { x: tile.x, y }, to: { x: endX, y } });
  }

  const rulers = importSheetRulers(options);
  const rulerGuides = rulers.map((position, index) => ({
    axis:
      index === 0 || index === 1 || index === 4 ? ("horizontal" as const) : ("vertical" as const),
    position,
  }));
  return { shade, grid, rulers, rulerGuides };
}
