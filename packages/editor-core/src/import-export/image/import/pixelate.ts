import type { PixelBuffer, Rgba } from "$/base/primitives";
import { assertDimension, assertPixelBuffer } from "$/document/pixel-validation";
import { protectPixelationContours } from "$/import-export/image/import/contours";
import { smoothPixelation } from "$/import-export/image/import/denoise";
import { blockPartition } from "$/import-export/image/import/grid";
import { resizeMostFrequent } from "$/import-export/image/import/most-frequent";
import { reduceToPalette, extractPixelationPalette } from "$/import-export/image/import/palette";
import {
  detectWithAlgorithm,
  recoverWithGrid,
} from "$/import-export/image/import/pixelation-algorithm-registry";
import { resizeBox, resizeNearest } from "$/import-export/image/import/resize";
import { samplePixelation } from "$/import-export/image/import/sampling";
import {
  PixelationMethod,
  PixelationMode,
  PixelationAlgorithm,
} from "$/import-export/image/import/types";
import type {
  PixelateOptions,
  PixelationSize,
  PixelGridAnalysis,
} from "$/import-export/image/import/types";

const WORKING_SCALE = 4;
const MAX_WORKING_PIXELS = 1_048_576;
const MAX_OUTLINE_STRENGTH = 100;
function prepareSource(
  image: PixelBuffer,
  target: PixelationSize,
  outlineStrength: number,
): PixelBuffer {
  const scale = Math.min(
    WORKING_SCALE,
    Math.sqrt(MAX_WORKING_PIXELS / (target.width * target.height)),
  );
  const width = Math.min(image.width, Math.max(1, Math.ceil(target.width * scale)));
  const height = Math.min(image.height, Math.max(1, Math.ceil(target.height * scale)));
  const working =
    image.width === width && image.height === height
      ? image
      : resizeBox(image, width, height, "premultiplied");
  return protectPixelationContours(working, outlineStrength);
}
function uniformBlocks(image: PixelBuffer, target: PixelationSize): PixelGridAnalysis {
  return {
    ...blockPartition(image, target.width, target.height),
    confidence: 1,
    reliable: true,
    algorithm: PixelationAlgorithm.UniformGrid,
  };
}
function sampleImage(
  image: PixelBuffer,
  options: PixelateOptions,
  method: PixelationMethod,
): PixelBuffer {
  // Grid recovery runs when asked for, or when only an algorithm was named and it finds a reliable grid.
  const wantsGrid =
    options.mode === PixelationMode.RecoverGrid ||
    (options.mode === undefined && options.algorithm !== undefined);
  const grid =
    options.grid ??
    (wantsGrid
      ? detectWithAlgorithm(image, options.algorithm ?? PixelationAlgorithm.Auto)
      : undefined);
  const mode =
    options.mode ??
    (grid && (!("reliable" in grid) || grid.reliable)
      ? PixelationMode.RecoverGrid
      : PixelationMode.Convert);
  if (mode !== PixelationMode.Convert && mode !== PixelationMode.RecoverGrid)
    throw new RangeError("Unknown pixelation mode.");
  if (mode === PixelationMode.RecoverGrid) {
    const found = grid ?? detectWithAlgorithm(image, options.algorithm ?? PixelationAlgorithm.Auto);
    if ("reliable" in found && !found.reliable)
      throw new Error(
        "No consistent pixel grid was detected. Turn off Automatic grid and choose cell sizes.",
      );
    return recoverWithGrid(image, found, options.colorPicker);
  }
  const target = resolveTargetSize(image, options);
  const strength = options.outlineStrength ?? 0;
  if (!Number.isFinite(strength) || strength < 0 || strength > MAX_OUTLINE_STRENGTH)
    throw new RangeError("Outline protection must be between 0 and 100.");
  if (options.blockPicker)
    return recoverWithGrid(image, uniformBlocks(image, target), options.colorPicker);
  const alphaMode = options.alphaMode ?? "straight";
  if (alphaMode !== "straight" && alphaMode !== "premultiplied")
    throw new RangeError("alphaMode must be 'straight' or 'premultiplied'");
  const prepared =
    strength || method === PixelationMethod.Dominant || method === PixelationMethod.Structure
      ? prepareSource(image, target, strength)
      : image;
  if (method === PixelationMethod.Nearest)
    return resizeNearest(prepared, target.width, target.height);
  if (method === PixelationMethod.Box)
    return resizeBox(prepared, target.width, target.height, alphaMode);
  if (method === PixelationMethod.MostFrequent)
    return resizeMostFrequent(prepared, target.width, target.height);
  return samplePixelation(prepared, target.width, target.height, method);
}

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

function validateMethod(value: PixelationMethod | undefined): PixelationMethod {
  const method = value ?? PixelationMethod.Nearest;
  if (!Object.values(PixelationMethod).includes(method))
    throw new RangeError("Unknown pixelation method.");
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
 * source area covered by each destination pixel. Local dominant and structural
 * sampling preserve contrasting regions; grid recovery restores one RGBA pixel
 * per detected cell. Color reduction keeps alpha independent of the RGB budget.
 */
export function pixelateImage(image: PixelBuffer, options: PixelateOptions = {}): PixelBuffer {
  assertPixelBuffer(image);
  const method = validateMethod(options.method);
  const sampled = sampleImage(image, options, method);
  const reduced = options.removeNoise ? smoothPixelation(sampled) : sampled;
  const maxColors = validateMaxColors(options.maxColors);
  let result = reduced;
  if (maxColors !== undefined || options.palette !== undefined) {
    let palette: readonly Rgba[];
    if (options.palette !== undefined) {
      if (!options.palette.length || options.palette.length > 256)
        throw new RangeError("Choose a palette with 1 to 256 colors.");
      if (
        !options.palette.some((color) => color[3] > 0) &&
        reduced.data.some((value, index) => index % 4 === 3 && value > 0)
      )
        throw new Error("Choose a palette containing a visible color.");
      palette = options.palette;
    } else {
      palette = extractPixelationPalette(reduced, { maxColors }).map((entry) => entry.color);
    }
    result = reduceToPalette(reduced, palette, { preserveAlpha: true });
  }
  if (
    options.preserveDimensions &&
    (result.width !== image.width || result.height !== image.height)
  ) {
    result = resizeNearest(result, image.width, image.height);
  }
  return result;
}
