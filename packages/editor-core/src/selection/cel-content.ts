import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, PixelMask, Rgba } from "$/base/primitives";
import { samplePixel } from "$/canvas/raster";
import {
  libreSpriteWorkingBrushColor,
  libreSpriteWorkingBrushIndex,
} from "$/color/operations/color-mode";
import { ensureTimeline } from "$/document/document";
import type { EditorDocument } from "$/document/types";
import { TILE_INDEX_MASK, tilesetForLayer } from "$/tilemap/model";
import { compositeTimeline } from "$/timeline/operations/composite-timeline";
import { LAYER_BACKGROUND } from "$/timeline/timeline";

/** Minimal projection of the active cel required by MaskContent. */
export interface CelContentSelectionProjection {
  readonly cel: {
    readonly pixels: PixelBuffer;
    readonly x: number;
    readonly y: number;
    readonly asepritePixels?: Uint8Array;
    readonly tilemap?: {
      readonly width: number;
      readonly height: number;
      readonly tileWords: Uint32Array;
      readonly tileIndexMask: number;
    };
  };
  readonly layer: { readonly kind?: "image" | "group" | "tilemap"; readonly background: boolean };
  readonly colorDepth?: 8 | 16 | 32;
  readonly transparentIndex?: number;
  readonly tileset?: {
    readonly tileWidth: number;
    readonly tileHeight: number;
    readonly tileCount: number;
    readonly asepritePixels?: Uint8Array;
    readonly pixels: Uint8Array;
  };
}

export interface CelContentColorReference {
  readonly index?: number;
  readonly color?: Rgba;
}

export function activeCelContentProjection(
  document: EditorDocument | null,
): CelContentSelectionProjection | null {
  if (!document) return null;
  if (
    !document.timeline &&
    (document.layer.emptyCel || !document.layer.pixels.width || !document.layer.pixels.height)
  )
    return null;
  const working = document.timeline ? document : { ...document, layer: { ...document.layer } };
  const timeline = working.timeline ?? ensureTimeline(working);
  const frame = timeline.frames[timeline.activeFrame];
  const cel = frame?.cels[timeline.activeLayer];
  const layer = timeline.layers[timeline.activeLayer];
  if (!cel || !layer) return null;
  let tileset: CelContentSelectionProjection["tileset"];
  if (layer.kind === "tilemap") {
    try {
      const set = tilesetForLayer(timeline, timeline.activeLayer);
      tileset = {
        tileWidth: set.tileWidth,
        tileHeight: set.tileHeight,
        tileCount: set.tileCount,
        asepritePixels: set.asepritePixels,
        pixels: set.pixels,
      };
    } catch {
      tileset = undefined;
    }
  }
  return {
    cel: {
      pixels: cel.pixels,
      x: cel.x,
      y: cel.y,
      asepritePixels: cel.asepriteSamples?.data,
      ...(cel.tilemap
        ? {
            tilemap: {
              width: cel.tilemap.width,
              height: cel.tilemap.height,
              tileWords: cel.tilemap.tiles,
              tileIndexMask: TILE_INDEX_MASK,
            },
          }
        : {}),
    },
    layer: { kind: layer.kind, background: !!(layer.flags & LAYER_BACKGROUND) },
    colorDepth: timeline.colorDepth,
    transparentIndex: timeline.transparentIndex,
    tileset,
  };
}

export function activeCelContentColorReference(
  document: EditorDocument | null,
  fallbackPalette: readonly Rgba[],
): CelContentColorReference | null {
  if (!document) return null;
  const working = document.timeline ? document : { ...document, layer: { ...document.layer } };
  const timeline = working.timeline ?? ensureTimeline(working);
  const layer = timeline.layers[timeline.activeLayer];
  if (!layer || !(layer.flags & LAYER_BACKGROUND)) return null;
  const palette =
    timeline.frames[timeline.activeFrame].palette ?? document.palette ?? fallbackPalette;
  const composite = compositeTimeline(working, undefined, undefined, false);
  const reference = samplePixel(composite, { x: 0, y: 0 });
  if (!reference) return null;
  const color = libreSpriteWorkingBrushColor(reference, timeline, palette);
  const index =
    timeline.colorDepth === 8
      ? libreSpriteWorkingBrushIndex(reference, timeline, palette)
      : undefined;
  return { color, ...(index === undefined ? {} : { index }) };
}

/** MaskContent is unavailable for groups, empty cels, and incomplete tile artwork. */
export function canSelectCelContent(source: CelContentSelectionProjection | null): boolean {
  if (!source || source.layer.kind === "group") return false;
  if (source.layer.kind !== "tilemap") return true;
  if (source.layer.background) return false;
  const set = source.tileset;
  if (!set) return false;
  const tilePixels = set.tileWidth * set.tileHeight;
  if (source.colorDepth === 8)
    return !!set.asepritePixels && set.asepritePixels.length >= tilePixels * set.tileCount;
  if (source.colorDepth === 16)
    return !!set.asepritePixels && set.asepritePixels.length >= tilePixels * set.tileCount * 2;
  return set.pixels.length >= tilePixels * set.tileCount * 4;
}

/** Build the MaskContent rectangle from a small, already-resolved projection. */
export function celContentSelection(
  source: CelContentSelectionProjection | null,
  reference?: CelContentColorReference | null,
): PixelMask | null {
  if (!canSelectCelContent(source) || !source) return null;
  const { cel, layer } = source;
  let left = cel.pixels.width,
    top = cel.pixels.height,
    right = -1,
    bottom = -1;
  if (cel.tilemap) {
    const set = source.tileset;
    if (!set) return null;
    const tilePixels = set.tileWidth * set.tileHeight,
      sourcePixels = set.asepritePixels,
      depth = source.colorDepth;
    const tileHasContent = (index: number) => {
      if (index <= 0 || index >= set.tileCount) return false;
      if (depth === 8 && sourcePixels) {
        const start = index * tilePixels;
        for (let i = 0; i < tilePixels; i++) if (sourcePixels[start + i] !== 0) return true;
        return false;
      }
      if (depth === 16 && sourcePixels) {
        const start = index * tilePixels * 2;
        for (let i = 0; i < tilePixels; i++) if (sourcePixels[start + i * 2 + 1] !== 0) return true;
        return false;
      }
      const start = index * tilePixels * 4;
      for (let i = 0; i < tilePixels; i++) if (set.pixels[start + i * 4 + 3] !== 0) return true;
      return false;
    };
    let cellLeft = cel.tilemap.width,
      cellTop = cel.tilemap.height,
      cellRight = -1,
      cellBottom = -1;
    for (let y = 0; y < cel.tilemap.height; y++)
      for (let x = 0; x < cel.tilemap.width; x++) {
        const tileIndex =
          cel.tilemap.tileWords[y * cel.tilemap.width + x] & cel.tilemap.tileIndexMask;
        if (tileHasContent(tileIndex)) {
          cellLeft = Math.min(cellLeft, x);
          cellTop = Math.min(cellTop, y);
          cellRight = Math.max(cellRight, x);
          cellBottom = Math.max(cellBottom, y);
        }
      }
    if (cellRight >= cellLeft) {
      left = cellLeft * set.tileWidth;
      top = cellTop * set.tileHeight;
      right = (cellRight + 1) * set.tileWidth - 1;
      bottom = (cellBottom + 1) * set.tileHeight - 1;
    }
  } else {
    const background = layer.background,
      raw = cel.asepritePixels,
      depth = source.colorDepth,
      referenceIndex = reference?.index,
      referenceColor = reference?.color;
    const hasContent = (x: number, y: number) => {
      const at = y * cel.pixels.width + x,
        pixel = at * 4;
      if (background) {
        if (depth === 8 && raw && referenceIndex !== undefined) return raw[at] !== referenceIndex;
        if (depth === 16 && raw && referenceColor)
          return raw[at * 2] !== referenceColor[0] || raw[at * 2 + 1] !== referenceColor[3];
        if (referenceColor)
          return !referenceColor.every(
            (value, channel) => cel.pixels.data[pixel + channel] === value,
          );
      }
      if (depth === 8 && raw) return raw[at] !== (source.transparentIndex ?? 0);
      if (depth === 16 && raw) return raw[at * 2 + 1] !== 0;
      return cel.pixels.data[pixel + 3] !== 0;
    };
    for (let y = 0; y < cel.pixels.height; y++)
      for (let x = 0; x < cel.pixels.width; x++)
        if (hasContent(x, y)) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
  }
  // Aseprite Mask::replace(cel->bounds()) is the fallback for an empty cel.
  if (right < left) {
    left = top = 0;
    right = cel.pixels.width - 1;
    bottom = cel.pixels.height - 1;
  }
  const width = right - left + 1,
    height = bottom - top + 1;
  return {
    x: cel.x + left,
    y: cel.y + top,
    width,
    height,
    data: new Uint8Array(width * height).fill(UINT8_MAX),
  };
}
