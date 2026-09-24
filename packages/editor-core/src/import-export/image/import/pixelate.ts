import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import {
  assertDimension,
  assertPixelBuffer,
  assertPixelCount,
  clampByte,
} from "$/document/pixel-validation";
import { extractPalette, reduceToPalette } from "$/import-export/image/import/palette";
import { PixelationMethod } from "$/import-export/image/import/types";
import type { PixelateOptions, PixelationSize } from "$/import-export/image/import/types";

function sizeFromBlock(blockSize: number | PixelationSize, image: PixelBuffer): PixelationSize {
  if (typeof blockSize === "number") {
    assertDimension(blockSize, "blockSize");
    return {
      width: Math.max(1, Math.ceil(image.width / blockSize)),
      height: Math.max(1, Math.ceil(image.height / blockSize)),
    };
  }
  if (!blockSize || typeof blockSize !== "object")
    throw new TypeError("blockSize must be a positive number or size");
  assertDimension(blockSize.width, "blockSize.width");
  assertDimension(blockSize.height, "blockSize.height");
  return {
    width: Math.max(1, Math.ceil(image.width / blockSize.width)),
    height: Math.max(1, Math.ceil(image.height / blockSize.height)),
  };
}

function resolveTargetSize(image: PixelBuffer, options: PixelateOptions): PixelationSize {
  const hasTargetFields = options.targetWidth !== undefined || options.targetHeight !== undefined;
  const hasTargetObject = options.targetSize !== undefined;
  if (hasTargetFields && hasTargetObject)
    throw new RangeError("Use a target size object or targetWidth/targetHeight, not both");
  if (
    (options.targetWidth !== undefined || options.targetHeight !== undefined) &&
    options.blockSize !== undefined
  ) {
    throw new RangeError("Use target dimensions or blockSize, not both");
  }
  if (options.targetSize && options.blockSize !== undefined) {
    throw new RangeError("Use target dimensions or blockSize, not both");
  }

  if (options.blockSize !== undefined) return sizeFromBlock(options.blockSize, image);
  const targetObject = options.targetSize;
  const targetWidth = targetObject?.width ?? options.targetWidth;
  const targetHeight = targetObject?.height ?? options.targetHeight;
  if (targetWidth === undefined && targetHeight === undefined)
    return { width: image.width, height: image.height };
  if (targetWidth !== undefined) assertDimension(targetWidth, "targetWidth");
  if (targetHeight !== undefined) assertDimension(targetHeight, "targetHeight");
  if (targetWidth === undefined) {
    return {
      width: Math.max(1, Math.round((image.width * (targetHeight as number)) / image.height)),
      height: targetHeight as number,
    };
  }
  if (targetHeight === undefined) {
    return {
      width: targetWidth,
      height: Math.max(1, Math.round((image.height * targetWidth) / image.width)),
    };
  }
  return { width: targetWidth, height: targetHeight };
}

function resizeNearest(image: PixelBuffer, width: number, height: number): PixelBuffer {
  assertDimension(width, "width");
  assertDimension(height, "height");
  assertPixelCount(width, height);
  const output = new Uint8ClampedArray(width * height * 4);
  const source = image.data;
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor((y * image.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor((x * image.width) / width));
      const sourceOffset = (sourceY * image.width + sourceX) * 4;
      const outputOffset = (y * width + x) * 4;
      output[outputOffset] = source[sourceOffset];
      output[outputOffset + 1] = source[sourceOffset + 1];
      output[outputOffset + 2] = source[sourceOffset + 2];
      output[outputOffset + 3] = source[sourceOffset + 3];
    }
  }
  return { width, height, data: output };
}

function resizeBox(
  image: PixelBuffer,
  width: number,
  height: number,
  alphaMode: "straight" | "premultiplied",
): PixelBuffer {
  assertDimension(width, "width");
  assertDimension(height, "height");
  assertPixelCount(width, height);
  const output = new Uint8ClampedArray(width * height * 4);
  const source = image.data;
  for (let y = 0; y < height; y += 1) {
    const sourceTop = (y * image.height) / height;
    const sourceBottom = ((y + 1) * image.height) / height;
    const firstY = Math.floor(sourceTop);
    const lastY = Math.min(image.height - 1, Math.ceil(sourceBottom) - 1);
    for (let x = 0; x < width; x += 1) {
      const sourceLeft = (x * image.width) / width;
      const sourceRight = ((x + 1) * image.width) / width;
      const firstX = Math.floor(sourceLeft);
      const lastX = Math.min(image.width - 1, Math.ceil(sourceRight) - 1);
      let weightTotal = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let sourceY = firstY; sourceY <= lastY; sourceY += 1) {
        const yWeight = Math.min(sourceBottom, sourceY + 1) - Math.max(sourceTop, sourceY);
        if (yWeight <= 0) continue;
        for (let sourceX = firstX; sourceX <= lastX; sourceX += 1) {
          const weight =
            yWeight * (Math.min(sourceRight, sourceX + 1) - Math.max(sourceLeft, sourceX));
          if (weight <= 0) continue;
          const sourceOffset = (sourceY * image.width + sourceX) * 4;
          const sourceAlpha = source[sourceOffset + 3];
          weightTotal += weight;
          alpha += sourceAlpha * weight;
          if (alphaMode === "premultiplied") {
            const alphaWeight = sourceAlpha / UINT8_MAX;
            red += source[sourceOffset] * alphaWeight * weight;
            green += source[sourceOffset + 1] * alphaWeight * weight;
            blue += source[sourceOffset + 2] * alphaWeight * weight;
          } else {
            red += source[sourceOffset] * weight;
            green += source[sourceOffset + 1] * weight;
            blue += source[sourceOffset + 2] * weight;
          }
        }
      }
      const outputOffset = (y * width + x) * 4;
      const averageAlpha = weightTotal === 0 ? 0 : alpha / weightTotal;
      output[outputOffset + 3] = clampByte(averageAlpha);
      if (alphaMode === "premultiplied") {
        const alphaTotal = alpha / UINT8_MAX;
        output[outputOffset] = clampByte(alphaTotal === 0 ? 0 : red / alphaTotal);
        output[outputOffset + 1] = clampByte(alphaTotal === 0 ? 0 : green / alphaTotal);
        output[outputOffset + 2] = clampByte(alphaTotal === 0 ? 0 : blue / alphaTotal);
      } else {
        output[outputOffset] = clampByte(weightTotal === 0 ? 0 : red / weightTotal);
        output[outputOffset + 1] = clampByte(weightTotal === 0 ? 0 : green / weightTotal);
        output[outputOffset + 2] = clampByte(weightTotal === 0 ? 0 : blue / weightTotal);
      }
    }
  }
  return { width, height, data: output };
}

function validateMethod(value: PixelationMethod | undefined): PixelationMethod {
  const method = value ?? PixelationMethod.Nearest;
  if (method !== PixelationMethod.Nearest && method !== PixelationMethod.Box)
    throw new RangeError("method must be 'nearest' or 'box'");
  return method;
}

function validateMaxColors(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 1)
    throw new RangeError("maxColors must be a positive integer");
  return Math.min(256, value);
}

/**
 * Pixelate an RGBA buffer without touching the source. Nearest mode follows
 * nearest-neighbor `floor(dst * src / dst)` mapping. Box mode averages the
 * source area covered by each destination pixel and can optionally preserve
 * transparent-edge colors with premultiplied alpha.
 */
export function pixelateImage(image: PixelBuffer, options: PixelateOptions = {}): PixelBuffer {
  assertPixelBuffer(image);
  const method = validateMethod(options.method);
  const target = resolveTargetSize(image, options);
  const alphaMode = options.alphaMode ?? "straight";
  if (alphaMode !== "straight" && alphaMode !== "premultiplied")
    throw new RangeError("alphaMode must be 'straight' or 'premultiplied'");
  const reduced =
    method === PixelationMethod.Nearest
      ? resizeNearest(image, target.width, target.height)
      : resizeBox(image, target.width, target.height, alphaMode);
  const maxColors = validateMaxColors(options.maxColors);
  let result = reduced;
  if (maxColors !== undefined || options.palette !== undefined) {
    let palette: readonly Rgba[];
    if (options.palette !== undefined) {
      palette = options.palette.slice(0, maxColors ?? 256);
    } else {
      palette = extractPalette(reduced, { maxColors }).map((entry) => entry.color);
    }
    result = reduceToPalette(reduced, palette);
  }
  if (
    options.preserveDimensions &&
    (result.width !== image.width || result.height !== image.height)
  ) {
    result = resizeNearest(result, image.width, image.height);
  }
  return result;
}
