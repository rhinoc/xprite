import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { clamp } from "@xprite/bedrock/common/clamp";

export function assertPixelBuffer(image: PixelBuffer, label = "image"): void {
  if (!image || typeof image !== "object") {
    throw new TypeError(`${label} must be a PixelBuffer`);
  }
  if (!Number.isSafeInteger(image.width) || image.width < 1 || image.width > MAX_IMAGE_DIMENSION) {
    throw new RangeError(`${label}.width must be an integer from 1 to ${MAX_IMAGE_DIMENSION}`);
  }
  if (
    !Number.isSafeInteger(image.height) ||
    image.height < 1 ||
    image.height > MAX_IMAGE_DIMENSION
  ) {
    throw new RangeError(`${label}.height must be an integer from 1 to ${MAX_IMAGE_DIMENSION}`);
  }
  const pixels = image.width * image.height;
  if (!Number.isSafeInteger(pixels) || pixels > MAX_IMAGE_PIXELS) {
    throw new RangeError(`${label} is too large; at most ${MAX_IMAGE_PIXELS} pixels are supported`);
  }
  if (!(image.data instanceof Uint8ClampedArray)) {
    throw new TypeError(`${label}.data must be a Uint8ClampedArray`);
  }
  const expectedLength = pixels * 4;
  if (image.data.length !== expectedLength) {
    throw new RangeError(`${label}.data must contain exactly ${expectedLength} bytes`);
  }
}

export function assertDimension(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_IMAGE_DIMENSION) {
    throw new RangeError(`${label} must be an integer from 1 to ${MAX_IMAGE_DIMENSION}`);
  }
  return value;
}

export function assertPixelCount(width: number, height: number, label = "image"): void {
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new RangeError(`${label} is too large; at most ${MAX_IMAGE_PIXELS} pixels are supported`);
  }
}

export function clampByte(value: number): number {
  return clamp(Math.round(value), 0, UINT8_MAX);
}
