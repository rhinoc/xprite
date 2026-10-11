import type { AsepriteImageSamples } from "$/base/image";
import type { Rgba } from "$/base/primitives";
import { encodeAsepriteSamples, paletteForColors } from "$/color/samples";
import type { EditorDocument } from "$/document/types";
import { TILE_INDEX_MASK } from "$/tilemap/model";
import { LAYER_BACKGROUND } from "$/timeline/timeline";

const RGBA_CHANNELS = 4;
const INDEXED_DEPTH = 8;
const GRAYSCALE_DEPTH = 16;
const GRAYSCALE_CHANNELS = 2;
const TRANSPARENT_COLOR_KEY = "0,0,0,0";

/** Exact palette usage in the selected cels, or the whole sprite when no range is selected. */
export function usedPaletteEntries(document: EditorDocument, palette: readonly Rgba[]): number[] {
  const used = new Set<number>();
  // Native palette extraction retains the mask color even for an empty image.
  const exactColors = new Set<string>([TRANSPARENT_COLOR_KEY]);
  const count = (data: Uint8Array | Uint8ClampedArray, samples?: AsepriteImageSamples) => {
    if (samples?.depth === INDEXED_DEPTH) {
      for (const index of samples.data) if (index < palette.length) used.add(index);
      return;
    }
    if (samples?.depth === GRAYSCALE_DEPTH) {
      for (let offset = 0; offset < samples.data.length; offset += GRAYSCALE_CHANNELS) {
        const value = samples.data[offset];
        const alpha = samples.data[offset + 1];
        if (alpha) exactColors.add(`${value},${value},${value},${alpha}`);
      }
      return;
    }
    for (let offset = 0; offset < data.length; offset += RGBA_CHANNELS) {
      if (data[offset + 3] === 0) continue;
      exactColors.add(
        `${data[offset]},${data[offset + 1]},${data[offset + 2]},${data[offset + 3]}`,
      );
    }
  };
  const timeline = document.timeline;
  if (!timeline) {
    count(document.layer.pixels.data);
  } else {
    const frames = timeline.range?.frames ?? timeline.frames.map((_, index) => index);
    const layers = timeline.range?.layers ?? timeline.layers.map((_, index) => index);
    for (const frameIndex of frames) {
      const frame = timeline.frames[frameIndex];
      if (!frame) continue;
      for (const layerIndex of layers) {
        const layer = timeline.layers[layerIndex];
        const cel = frame.cels[layerIndex];
        if (!layer || !cel || layer.kind === "group") continue;
        if (cel.tilemap) {
          const tileset = timeline.tilesets?.find((set) => set.id === layer.tilesetId);
          if (!tileset) continue;
          const tilePixels = tileset.tileWidth * tileset.tileHeight;
          const tiles = new Set(Array.from(cel.tilemap.tiles, (word) => word & TILE_INDEX_MASK));
          for (const tile of tiles) {
            if (tile >= tileset.tileCount) continue;
            const depth = timeline.colorDepth;
            if ((depth === INDEXED_DEPTH || depth === GRAYSCALE_DEPTH) && tileset.asepritePixels) {
              const channels = depth === INDEXED_DEPTH ? 1 : GRAYSCALE_CHANNELS;
              const start = tile * tilePixels * channels;
              count(tileset.pixels, {
                depth,
                width: tileset.tileWidth,
                height: tileset.tileHeight,
                data: tileset.asepritePixels.subarray(start, start + tilePixels * channels),
              });
            } else {
              const start = tile * tilePixels * RGBA_CHANNELS;
              count(tileset.pixels.subarray(start, start + tilePixels * RGBA_CHANNELS));
            }
          }
        } else {
          const samples =
            timeline.colorDepth === INDEXED_DEPTH
              ? encodeAsepriteSamples(
                  cel.pixels,
                  INDEXED_DEPTH,
                  paletteForColors(frame.palette ?? document.palette ?? palette),
                  layer.flags & LAYER_BACKGROUND ? -1 : (timeline.transparentIndex ?? 0),
                  cel.asepriteSamples,
                )
              : cel.asepriteSamples;
          count(cel.pixels.data, samples);
        }
      }
    }
  }
  return palette.flatMap((color, index) =>
    used.has(index) || exactColors.has(color.join(",")) ? [index] : [],
  );
}

/** Tiles in the active tileset, across the timeline range or every cel of matching layers. */
export function usedTilesetEntries(
  document: EditorDocument,
): { tilesetId: number; count: number; used: number[] } | null {
  const timeline = document.timeline;
  if (!timeline) return null;
  const active = timeline.layers[timeline.activeLayer];
  if (active?.kind !== "tilemap") return null;
  const tileset = timeline.tilesets?.find((set) => set.id === active.tilesetId);
  if (!tileset) return null;
  const used = new Set<number>();
  const frames = timeline.range?.frames ?? timeline.frames.map((_, index) => index);
  const layers = timeline.range?.layers ?? timeline.layers.map((_, index) => index);
  for (const fi of frames)
    for (const li of layers) {
      if (timeline.layers[li]?.kind !== "tilemap" || timeline.layers[li]?.tilesetId !== tileset.id)
        continue;
      for (const word of timeline.frames[fi]?.cels[li]?.tilemap?.tiles ?? []) {
        const index = word & TILE_INDEX_MASK;
        if (index < tileset.tileCount) used.add(index);
      }
    }
  return { tilesetId: tileset.id, count: tileset.tileCount, used: [...used].sort((a, b) => a - b) };
}
