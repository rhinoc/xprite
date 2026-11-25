/** Conservative allocation policy for browser canvas-backed image codecs. */
export const CANVAS_IMAGE_MAX_DIMENSION = 16_384;
export const CANVAS_IMAGE_MAX_PIXELS = 67_108_864;
/** Cross-browser safe area for 2D canvas encoding, including mobile WebKit and low-overhead copies. */
export const CANVAS_ENCODE_SAFE_PIXELS = 16_777_216;
/** Allocation policy for portable streaming codecs that bypass browser 2D canvases. */
export const PORTABLE_IMAGE_MAX_DIMENSION = 32_768;
export const PORTABLE_IMAGE_MAX_PIXELS = 67_108_864;

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

export const PORTABLE_IMAGE_LIMITS: Readonly<ImageDimensionLimits> = {
  maxWidth: PORTABLE_IMAGE_MAX_DIMENSION,
  maxHeight: PORTABLE_IMAGE_MAX_DIMENSION,
  maxPixels: PORTABLE_IMAGE_MAX_PIXELS,
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
