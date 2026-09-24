import { BITS_PER_BYTE } from "$/base/numeric-constants";
import type { Rgba } from "$/base/primitives";
import { encodeAsepriteSamples, paletteForColors } from "$/color/samples";
import type { AsepriteImageSamples } from "$/color/samples";
import type { EditorDocument } from "$/document/types";
import type { DrawingGestureState } from "$/drawing/gesture-controller";
import { commitTilemapPixels, rasterizeTilemapSamples, tilesetForLayer } from "$/tilemap/model";
import { AsepriteTilemapIndexWriter } from "$/tilemap/tools";
import { TilesetMode } from "$/tilemap/types";
import type { SpriteTimeline } from "$/timeline/timeline";

/** Update only the active projection while a manual tilemap stroke is previewing. */
export function refreshManualPixelPerfectTilemapPreview(
  document: EditorDocument,
  gesture: DrawingGestureState,
  fallbackPalette: readonly Rgba[],
): void {
  const base = gesture?.manualTilemapPreviewTimeline ?? gesture?.manualTilemapBase;
  if (!gesture.manualTilemapBase || !base || !gesture.pixelPerfect) return;
  const frame = base.activeFrame;
  const layer = base.activeLayer;
  const cel = base.frames[frame].cels[layer];
  const pixels = document.layer.pixels;
  if (!cel?.tilemap) return;

  const indexWriter =
    gesture.indexedPixelWriter instanceof AsepriteTilemapIndexWriter
      ? gesture.indexedPixelWriter
      : undefined;
  const unchangedPixels =
    pixels.width === cel.pixels.width &&
    pixels.height === cel.pixels.height &&
    !pixels.data.some((value, index) => value !== cel.pixels.data[index]);
  if (unchangedPixels && !indexWriter?.hasChanges()) return;

  let asepriteSamples: AsepriteImageSamples | undefined;
  if (base.colorDepth === 8 || base.colorDepth === 16) {
    const depth = base.colorDepth;
    const tileset = tilesetForLayer(base, layer);
    const mask = base.transparentIndex ?? 0;
    const bytesPerPixel = depth / BITS_PER_BYTE;
    const palette = paletteForColors(
      base.frames[frame].palette ?? document.palette ?? fallbackPalette,
    );
    if (depth === 8 && indexWriter) {
      asepriteSamples = encodeAsepriteSamples(
        pixels,
        8,
        palette,
        mask,
        indexWriter.samplesForLayer(),
      );
    } else {
      const source = tileset.asepritePixels
        ? rasterizeTilemapSamples(cel.tilemap, tileset, depth, mask)
        : encodeAsepriteSamples(cel.pixels, depth, palette, mask);
      const data = new Uint8Array(pixels.width * pixels.height * bytesPerPixel);
      if (depth === 8) data.fill(mask);
      const dx = cel.x - document.layer.x;
      const dy = cel.y - document.layer.y;
      const sourceX = Math.max(0, -dx);
      const sourceY = Math.max(0, -dy);
      const endX = Math.min(source.width, pixels.width - dx);
      const endY = Math.min(source.height, pixels.height - dy);
      if (endX > sourceX && endY > sourceY)
        for (let y = sourceY; y < endY; y++) {
          const sourceOffset = (y * source.width + sourceX) * bytesPerPixel;
          const targetOffset = ((y + dy) * pixels.width + sourceX + dx) * bytesPerPixel;
          data.set(
            source.data.subarray(sourceOffset, sourceOffset + (endX - sourceX) * bytesPerPixel),
            targetOffset,
          );
        }
      asepriteSamples = encodeAsepriteSamples(pixels, depth, palette, mask, {
        depth,
        width: pixels.width,
        height: pixels.height,
        data,
      });
    }
  }

  const preview = commitTilemapPixels(
    base,
    frame,
    layer,
    pixels,
    document.layer.x,
    document.layer.y,
    TilesetMode.Manual,
    asepriteSamples,
  );
  const previewCel = preview.frames[frame].cels[layer];
  if (!previewCel) return;
  gesture.manualTilemapPreviewTimeline = preview;
  document.layer = {
    ...document.layer,
    pixels: previewCel.pixels,
    x: previewCel.x,
    y: previewCel.y,
    celOpacity: previewCel.opacity,
    zIndex: previewCel.zIndex,
  };
  if (gesture.indexedPixelWriter instanceof AsepriteTilemapIndexWriter)
    gesture.indexedPixelWriter.refresh(preview);
}

export function manualTilemapPreviewChanged(
  base: SpriteTimeline,
  preview: SpriteTimeline,
): boolean {
  const original = tilesetForLayer(base, base.activeLayer);
  const next = tilesetForLayer(preview, preview.activeLayer);
  const sameBytes = (a: Uint8Array | undefined, b: Uint8Array | undefined) =>
    a === b ||
    (!!a && !!b && a.length === b.length && a.every((value, index) => value === b[index]));
  return (
    original.tileCount !== next.tileCount ||
    !sameBytes(original.pixels, next.pixels) ||
    !sameBytes(original.asepritePixels, next.asepritePixels)
  );
}
