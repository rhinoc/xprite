import { EditorAllocationError } from "$/base/errors";
import { MAX_DOCUMENT_PIXEL_BYTES } from "$/base/image-limits";
import type { PixelBuffer } from "$/base/primitives";
import type { EditorDocument } from "$/document/types";
import type { SpriteTimeline } from "$/timeline/types";

/** Match loadTimeline's unique-cel budget before accepting a document edit.
 * Undo and recovery are separate copies and must not change this content budget. */
export function assertDocumentMemoryBudget(
  document: EditorDocument,
  maxBytes = MAX_DOCUMENT_PIXEL_BYTES,
): void {
  if (!document.timeline) {
    if (document.layer.pixels.width * document.layer.pixels.height * 4 > maxBytes)
      throw new EditorAllocationError(
        document.width,
        document.height,
        "document",
        document.layer.pixels.width * document.layer.pixels.height * 4,
      );
    return;
  }
  assertTimelineMemoryBudget(document.timeline, document.width, document.height, maxBytes);
}

export function assertTimelineMemoryBudget(
  timeline: SpriteTimeline,
  width: number,
  height: number,
  maxBytes = MAX_DOCUMENT_PIXEL_BYTES,
): void {
  // ASE links are scoped to a layer. A shared buffer used by two layers is
  // serialized as two images, so budget the same representation we must restore.
  const images = timeline.layers.map(() => new Set<PixelBuffer>());
  let bytes = 0;
  const retain = (image: PixelBuffer, layer: number) => {
    if (images[layer].has(image)) return;
    images[layer].add(image);
    bytes += image.width * image.height * 4;
    if (bytes > maxBytes) throw new EditorAllocationError(width, height, "document", bytes);
  };
  for (const frame of timeline.frames) {
    for (let layer = 0; layer < frame.cels.length; layer++) {
      const cel = frame.cels[layer];
      if (cel) retain(cel.pixels, layer);
    }
  }
}
