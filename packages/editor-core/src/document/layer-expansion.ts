import { EditorAllocationError } from "$/base/errors";
import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import type { PixelBuffer, Rect, Rgba } from "$/base/primitives";
import type { EditorDocument } from "$/document/types";
import { isBackgroundLayer } from "$/timeline/timeline";

/** Expand active-layer pixels while preserving their document-space origin. */
export function expandActiveLayer(
  document: EditorDocument,
  extra?: Rect,
  backgroundClearColor?: () => Rgba,
): void {
  const layer = document.layer;
  const left = Math.min(0, layer.x, extra?.x ?? 0);
  const top = Math.min(0, layer.y, extra?.y ?? 0);
  const right = Math.max(
    document.width,
    layer.x + layer.pixels.width,
    extra ? extra.x + extra.width : 0,
  );
  const bottom = Math.max(
    document.height,
    layer.y + layer.pixels.height,
    extra ? extra.y + extra.height : 0,
  );
  if (
    left === layer.x &&
    top === layer.y &&
    right - left === layer.pixels.width &&
    bottom - top === layer.pixels.height
  )
    return;

  const width = right - left;
  const height = bottom - top;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  )
    throw new EditorAllocationError(width, height);

  const image: PixelBuffer = {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  };
  const timeline = document.timeline;
  if (
    timeline &&
    isBackgroundLayer(timeline.layers[timeline.activeLayer]) &&
    backgroundClearColor
  ) {
    const clearColor = backgroundClearColor();
    for (let offset = 0; offset < image.data.length; offset += 4)
      image.data.set(clearColor, offset);
  }
  for (let y = 0; y < layer.pixels.height; y++)
    image.data.set(
      layer.pixels.data.subarray(y * layer.pixels.width * 4, (y + 1) * layer.pixels.width * 4),
      ((y + layer.y - top) * image.width + layer.x - left) * 4,
    );
  document.layer = { ...layer, x: left, y: top, pixels: image };
}
