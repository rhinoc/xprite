import type { PixelBuffer } from "$/base/primitives";
import {
  createEncodedPixelBuffer,
  encodedPixels,
  type DecodedPixelCache,
} from "$/document/pixel-storage";

const immutableImages = new WeakSet<PixelBuffer>();
const immutableData = new WeakSet<Uint8ClampedArray>();

/** Imported snapshots remain immutable while editor-owned image containers can
 * borrow their pixels until that cel is activated for editing. */
export function markImmutableImage(image: PixelBuffer): void {
  immutableImages.add(image);
  if (!encodedPixels(image)) immutableData.add(image.data);
}

export function isImmutableImageData(data: Uint8ClampedArray): boolean {
  return immutableData.has(data);
}

export function copyEditorImage(image: PixelBuffer, cache?: DecodedPixelCache): PixelBuffer {
  const encoded = encodedPixels(image);
  if (encoded) {
    const immutable = immutableImages.has(image);
    const result = immutable
      ? createEncodedPixelBuffer(image.width, image.height, encoded)
      : createEncodedPixelBuffer(
          image.width,
          image.height,
          { ...encoded, bytes: encoded.bytes.slice() },
          cache,
        );
    immutableImages.add(result);
    return result;
  }
  const result = {
    ...image,
    data: immutableImages.has(image) ? image.data : new Uint8ClampedArray(image.data),
  };
  if (immutableImages.has(image)) immutableImages.add(result);
  return result;
}

/** Only call on an editor-owned container, never on the imported snapshot. All
 * linked cels in that editor share this container, preserving linked edits. */
export function makeEditorImageWritable(image: PixelBuffer): void {
  const deferred = !!encodedPixels(image);
  if (!immutableImages.delete(image) && !deferred) return;
  image.data = new Uint8ClampedArray(image.data);
}
