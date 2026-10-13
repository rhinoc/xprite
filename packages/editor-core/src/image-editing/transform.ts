import { BITS_PER_BYTE } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import type { AsepriteImageSamples } from "$/color/samples";
import { activateTimelineCel, ensureTimeline } from "$/document/document";
import type { EditorDocument } from "$/document/types";
import { refreshTilemapProjections, type TilemapImage } from "$/tilemap/model";
import { timelineCelIdentity, timelineCelSites } from "$/timeline/operations/cel-movement";
import { effectiveLayerVisible, layerAncestors, LAYER_REFERENCE } from "$/timeline/timeline";
import type { TimelineCel } from "$/timeline/types";

export enum FlipOrientation {
  Horizontal = "horizontal",
  Vertical = "vertical",
}

function flipBytes(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  channels: number,
  orientation: FlipOrientation,
) {
  const output = data.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourceX = orientation === FlipOrientation.Horizontal ? width - 1 - x : x;
      const sourceY = orientation === FlipOrientation.Vertical ? height - 1 - y : y;
      const from = (sourceY * width + sourceX) * channels;
      const to = (y * width + x) * channels;
      for (let c = 0; c < channels; c++) output[to + c] = data[from + c];
    }
  }
  return output;
}

/** Flip(target=canvas) includes locked/hidden layers and every frame. Create
 * each linked image once, so history can retain the old immutable image. */
export function flipDocumentCanvas(doc: EditorDocument, orientation: FlipOrientation) {
  flipDocumentCels(doc, orientation, () => true, true);
}

/**
 * Flip(target=mask) without a visible selection (cmd_flip.cpp onExecute): mirror the whole image
 * of each cel in the timeline range, or of the active cel, across the sprite bounds. Layers that
 * cannot edit pixels are skipped; linked cels move with their image. Returns false if none.
 */
export function flipSelectedCels(doc: EditorDocument, orientation: FlipOrientation): boolean {
  const targets = selectedCelFlipTargets(doc);
  if (!targets.size) return false;
  flipDocumentCels(doc, orientation, (cel) => targets.has(timelineCelIdentity(cel)), false);
  return true;
}

/** Whether Flip without a selection has a cel whose pixels it may edit. */
export function canFlipSelectedCels(doc: EditorDocument | null): boolean {
  if (!doc) return false;
  // A document without a timeline is a single visible-or-not layer; do not create one here.
  if (!doc.timeline) return doc.layer.visible && !doc.layer.locked;
  return selectedCelFlipTargets(doc).size > 0;
}

function selectedCelFlipTargets(doc: EditorDocument): Set<object> {
  const timeline = ensureTimeline(doc);
  const sites = timelineCelSites(timeline, true);
  const targets = new Set<object>();
  for (const layer of sites.layers) {
    const item = timeline.layers[layer];
    if (
      !item ||
      item.kind === "group" ||
      item.flags & LAYER_REFERENCE ||
      !effectiveLayerVisible(timeline, layer) ||
      item.locked ||
      layerAncestors(timeline, layer).some((parent) => parent.locked)
    )
      continue;
    for (const frame of sites.frames) {
      const cel = timeline.frames[frame]?.cels[layer];
      if (cel) targets.add(timelineCelIdentity(cel));
    }
  }
  return targets;
}

function flipDocumentCels(
  doc: EditorDocument,
  orientation: FlipOrientation,
  include: (cel: TimelineCel) => boolean,
  flipMasks: boolean,
) {
  const timeline = ensureTimeline(doc);
  const tilemaps = new Map<TilemapImage, TilemapImage>();
  const images = new Map<PixelBuffer, PixelBuffer>(),
    sampleImageCopies = new Map<AsepriteImageSamples, AsepriteImageSamples>();
  doc.timeline = {
    ...timeline,
    frames: timeline.frames.map((frame) => ({
      ...frame,
      cels: frame.cels.map((cel, layerIndex) => {
        if (!cel) return null;
        if (!include(cel)) return cel;
        if (cel.tilemap) {
          let tilemap = tilemaps.get(cel.tilemap);
          if (!tilemap) {
            const old = cel.tilemap,
              tiles = new Uint32Array(old.tiles.length);
            for (let y = 0; y < old.height; y++)
              for (let x = 0; x < old.width; x++) {
                const sx = orientation === FlipOrientation.Horizontal ? old.width - 1 - x : x;
                const sy = orientation === FlipOrientation.Vertical ? old.height - 1 - y : y;
                // Aseprite FlipImage swaps packed words, including existing flags.
                tiles[y * old.width + x] = old.tiles[sy * old.width + sx];
              }
            tilemap = { ...old, tiles };
            tilemaps.set(old, tilemap);
          }
          // cmd_flip.cpp uses image dimensions in cells even for cel position.
          // Aseprite CLI oracle confirms this is not a pixel-wise visual mirror.
          return {
            ...cel,
            tilemap,
            x:
              orientation === FlipOrientation.Horizontal
                ? doc.width - cel.tilemap.width - cel.x
                : cel.x,
            y:
              orientation === FlipOrientation.Vertical
                ? doc.height - cel.tilemap.height - cel.y
                : cel.y,
          };
        }
        let pixels = images.get(cel.pixels);
        if (!pixels) {
          pixels = {
            ...cel.pixels,
            data: flipBytes(
              cel.pixels.data,
              cel.pixels.width,
              cel.pixels.height,
              4,
              orientation,
            ) as Uint8ClampedArray,
          };
          images.set(cel.pixels, pixels);
        }
        let asepriteSamples = cel.asepriteSamples;
        if (asepriteSamples) {
          let flipped = sampleImageCopies.get(asepriteSamples);
          if (!flipped) {
            flipped = {
              ...asepriteSamples,
              data: flipBytes(
                asepriteSamples.data,
                asepriteSamples.width,
                asepriteSamples.height,
                asepriteSamples.depth / BITS_PER_BYTE,
                orientation,
              ) as Uint8Array,
            };
            sampleImageCopies.set(asepriteSamples, flipped);
          }
          asepriteSamples = flipped;
        }
        if (timeline.layers[layerIndex].flags & LAYER_REFERENCE) {
          const bounds = cel.preciseBounds ?? {
            x: cel.x,
            y: cel.y,
            width: cel.pixels.width,
            height: cel.pixels.height,
          };
          const preciseBounds = {
            ...bounds,
            x:
              orientation === FlipOrientation.Horizontal
                ? doc.width - bounds.width - bounds.x
                : bounds.x,
            y:
              orientation === FlipOrientation.Vertical
                ? doc.height - bounds.height - bounds.y
                : bounds.y,
          };
          return {
            ...cel,
            pixels,
            asepriteSamples,
            x: Math.trunc(preciseBounds.x),
            y: Math.trunc(preciseBounds.y),
            preciseBounds,
          };
        }
        return {
          ...cel,
          pixels,
          asepriteSamples,
          x:
            orientation === FlipOrientation.Horizontal
              ? doc.width - cel.pixels.width - cel.x
              : cel.x,
          y:
            orientation === FlipOrientation.Vertical
              ? doc.height - cel.pixels.height - cel.y
              : cel.y,
        };
      }),
    })),
  };
  if (timeline.tilesets?.length) doc.timeline = refreshTilemapProjections(doc.timeline);
  // FlipMask works on the document bitmap regardless of mask visibility.
  for (const key of flipMasks ? (["selection", "hiddenSelection"] as const) : []) {
    const mask = doc[key];
    if (mask)
      doc[key] = {
        ...mask,
        x: orientation === FlipOrientation.Horizontal ? doc.width - mask.width - mask.x : mask.x,
        y: orientation === FlipOrientation.Vertical ? doc.height - mask.height - mask.y : mask.y,
        data: flipBytes(mask.data, mask.width, mask.height, 1, orientation) as Uint8Array,
      };
  }
  activateTimelineCel(doc, timeline.activeFrame, timeline.activeLayer);
}
