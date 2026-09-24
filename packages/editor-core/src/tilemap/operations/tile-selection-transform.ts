import { EditorAllocationError } from "$/base/errors";
import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import {
  FIXED_POINT_16_16_MAX,
  FIXED_POINT_16_16_SCALE,
  UINT8_MAX,
} from "$/base/numeric-constants";
import type { Point, Rect, PixelMask } from "$/base/primitives";
import type { ClipboardImage } from "$/clipboard/image";
import { validateClipboardImage } from "$/clipboard/image";
import { cloneClipboardTileset } from "$/clipboard/tile";
import { activateTimelineCel } from "$/document/document";
import type { EditorDocument } from "$/document/types";
import type { SelectionTransform } from "$/selection/transform";
import { rasterizeTilemap } from "$/tilemap/model";
import { applyTilemapPoints, tilemapBrushPoints } from "$/tilemap/tools";
import type { SpriteTimeline } from "$/timeline/timeline";

export function clearTilemapSelectionForTransform(
  document: EditorDocument,
  timeline: SpriteTimeline,
): void {
  const map = timeline.frames[timeline.activeFrame].cels[timeline.activeLayer]?.tilemap;
  if (!map) return;
  const points = tilemapBrushPoints(
    document,
    timeline,
    { x: 0, y: 0 },
    { x: map.width - 1, y: map.height - 1 },
    "filled_rectangle",
  );
  const updated = applyTilemapPoints(timeline, points, 0);
  document.timeline = updated;
  activateTimelineCel(document, updated.activeFrame, updated.activeLayer);
}

/** Tiles-mode resizing uses a repeating nine-slice grid: border cells retain
 * their positions while interior cells repeat. Native resizing keeps that grid
 * order even across an anchor; only the selection mask follows signed corners.
 * An explicit flip moves tile words without changing their orientation flags.
 * Inputs are never modified, including the shared Tileset's Aseprite samples. */
export function transformTilemapSelection(
  image: ClipboardImage,
  value: Pick<SelectionTransform, "bounds" | "angle">,
  flip?: "horizontal" | "vertical",
  originalMask?: PixelMask,
): { image: ClipboardImage; bounds: Rect; origin: Point } {
  validateClipboardImage(image);
  if (!image.tilemap) throw new TypeError("A Tilemap clipboard is required");
  if (
    originalMask &&
    (!Number.isSafeInteger(originalMask.width) ||
      !Number.isSafeInteger(originalMask.height) ||
      originalMask.width < 1 ||
      originalMask.height < 1 ||
      originalMask.width > MAX_IMAGE_DIMENSION ||
      originalMask.height > MAX_IMAGE_DIMENSION ||
      originalMask.width * originalMask.height > MAX_IMAGE_PIXELS ||
      originalMask.data.length !== originalMask.width * originalMask.height)
  )
    throw new RangeError("Invalid original Tilemap selection mask");
  const signedBounds = value.bounds;
  if (
    ![signedBounds.x, signedBounds.y, signedBounds.width, signedBounds.height, value.angle].every(
      Number.isFinite,
    )
  )
    throw new RangeError("Invalid Tilemap selection transform");
  const b = {
    x: Math.min(signedBounds.x, signedBounds.x + signedBounds.width),
    y: Math.min(signedBounds.y, signedBounds.y + signedBounds.height),
    width: Math.abs(signedBounds.width),
    height: Math.abs(signedBounds.height),
  };
  const flipX = signedBounds.width < 0 !== (flip === "horizontal"),
    flipY = signedBounds.height < 0 !== (flip === "vertical"),
    collapsed = !b.width || !b.height;
  // Arbitrary rotation cannot preserve the discrete tile grid.
  if (Math.abs(value.angle) > 1e-8)
    throw new RangeError("Tiles mode does not support selection rotation; switch to Pixels mode");
  const { map: source, selected: sourceSelected, tileset } = image.tilemap;
  const tw = tileset.tileWidth,
    th = tileset.tileHeight;
  const grid = image.mask ?? { x: 0, y: 0 };
  const x = grid.x + Math.floor((b.x - grid.x) / tw) * tw;
  const y = grid.y + Math.floor((b.y - grid.y) / th) * th;
  const width = Math.max(1, Math.ceil((b.x + b.width - x) / tw));
  const height = Math.max(1, Math.ceil((b.y + b.height - y) / th));
  const pw = width * tw,
    ph = height * th;
  if (
    !Number.isSafeInteger(x) ||
    !Number.isSafeInteger(y) ||
    pw > MAX_IMAGE_DIMENSION ||
    ph > MAX_IMAGE_DIMENSION ||
    pw * ph > MAX_IMAGE_PIXELS
  )
    throw new EditorAllocationError(pw, ph);
  const tiles = new Uint32Array(width * height),
    selected = new Uint8Array(width * height);
  const sourcePositions = (at: number, destinationSize: number, sourceSize: number): number[] => {
    if (destinationSize === 1) return sourceSize === 1 ? [0] : [0, sourceSize - 1];
    if (at === 0) return [0];
    const interior = Math.min(1, sourceSize - 1) + ((at - 1) % Math.max(1, sourceSize - 2));
    if (at === destinationSize - 1)
      return destinationSize > 2 && (at - 1) % Math.max(1, sourceSize - 2) !== 0
        ? [interior, sourceSize - 1]
        : [sourceSize - 1];
    return [interior];
  };
  const sourceColumns = Array.from({ length: width }, (_, dx) =>
    sourcePositions(dx, width, source.width),
  );
  const sourceRows = Array.from({ length: height }, (_, dy) =>
    sourcePositions(dy, height, source.height),
  );
  for (let dy = 0; dy < height; dy++)
    for (let dx = 0; dx < width; dx++) {
      if (collapsed) continue;
      const target = dy * width + dx;
      for (const row of sourceRows[dy])
        for (const column of sourceColumns[dx]) {
          const sx = flip === "horizontal" ? source.width - 1 - column : column;
          const sy = flip === "vertical" ? source.height - 1 - row : row;
          const from = sy * source.width + sx;
          if (sourceSelected[from] && source.tiles[from]) {
            selected[target] = UINT8_MAX;
            tiles[target] = source.tiles[from];
          }
        }
    }
  const data = new Uint8Array(pw * ph);
  // The pixel mask uses nearest-neighbor sampling separately from the tile
  // layout. A sparse selection can therefore differ from the
  // repeated tile layout; keep its pixels separate from the paste footprint.
  // A partial-tile mask retains its own source dimensions and transformed
  // corners; only the tile image is expanded to the grid.
  const sourceMask = originalMask ?? image.mask;
  const sourceWidth = sourceMask?.width ?? image.pixels.width;
  const sourceHeight = sourceMask?.height ?? image.pixels.height;
  const offsetX = originalMask ? Math.trunc(b.x - x) : 0;
  const offsetY = originalMask ? Math.trunc(b.y - y) : 0;
  const maskWidth = collapsed ? 0 : originalMask ? Math.trunc(b.x + b.width - x) - offsetX : pw;
  const maskHeight = collapsed ? 0 : originalMask ? Math.trunc(b.y + b.height - y) - offsetY : ph;
  // .refs/libresprite/src/doc/algorithm/rotate.cpp (MIT) uses 16.16 fixed-point
  // parallelogram sampling and an X bias of 0x7fff. Exact ties choose left.
  const stepX = Math.floor((sourceWidth * FIXED_POINT_16_16_SCALE) / maskWidth);
  const firstX = Math.round((FIXED_POINT_16_16_MAX * stepX) / FIXED_POINT_16_16_SCALE);
  const stepY = Math.round((sourceHeight * FIXED_POINT_16_16_SCALE - 1) / maskHeight);
  const firstY = Math.round(stepY / 2);
  for (let yy = 0; yy < maskHeight; yy++)
    for (let xx = 0; xx < maskWidth; xx++) {
      let sx = Math.min(
        sourceWidth - 1,
        Math.floor((firstX + xx * stepX) / FIXED_POINT_16_16_SCALE),
      );
      let sy = Math.min(
        sourceHeight - 1,
        Math.floor((firstY + yy * stepY) / FIXED_POINT_16_16_SCALE),
      );
      if (flipX) sx = sourceWidth - 1 - sx;
      if (flipY) sy = sourceHeight - 1 - sy;
      if (
        sourceMask
          ? sourceMask.data[sy * sourceWidth + sx]
          : sourceSelected[Math.floor(sy / th) * source.width + Math.floor(sx / tw)]
      )
        data[(yy + offsetY) * pw + xx + offsetX] = UINT8_MAX;
    }
  const map = { width, height, tiles };
  const clonedSet = cloneClipboardTileset(tileset);
  const depth = clonedSet.asepritePixels
    ? clonedSet.asepritePixels.length / (clonedSet.tileCount * tw * th) === 1
      ? 8
      : 16
    : 32;
  const mask = { x, y, width: pw, height: ph, data };
  return {
    origin: { x, y },
    bounds: { x, y, width: pw, height: ph },
    image: {
      ...image,
      asepriteSamples: undefined,
      pixels: rasterizeTilemap(map, clonedSet, depth, image.palette, image.transparentIndex),
      mask,
      tilemap: { map, selected, tileset: clonedSet },
    },
  };
}
