/** Conservative allocation policy for browser canvas-backed image codecs. */
export const CANVAS_IMAGE_MAX_DIMENSION = 16_384;
export const CANVAS_IMAGE_MAX_PIXELS = 67_108_864;

export interface ImageDimensionLimits {
  maxWidth: number;
  maxHeight: number;
  maxPixels: number;
}

export const CANVAS_IMAGE_LIMITS: Readonly<ImageDimensionLimits> = {
  maxWidth: CANVAS_IMAGE_MAX_DIMENSION,
  maxHeight: CANVAS_IMAGE_MAX_DIMENSION,
  maxPixels: CANVAS_IMAGE_MAX_PIXELS,
};

/** No allocations or browser APIs: usable by codec adapters and output planners. */
export function imageDimensionsWithinLimits(
  width: number,
  height: number,
  limits: Readonly<ImageDimensionLimits>,
): boolean {
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= limits.maxWidth &&
    height <= limits.maxHeight &&
    width * height <= limits.maxPixels
  );
}
