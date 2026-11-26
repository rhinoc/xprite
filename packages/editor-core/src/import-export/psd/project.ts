import { UINT8_MAX, type PixelBuffer, type Rgba } from "$/base";
import { blendAt, mulUn8 } from "$/canvas";
import {
  assertDimension,
  assertPixelCount,
  assertTimelineMemoryBudget,
  type EditorProject,
} from "$/document";
import { applyAdjustmentToPixels, isSupportedAdjustment } from "$/import-export/psd/adjustments";
import { bakeExtraPsdBlendMode, isUnsupportedXpriteBlendMode } from "$/import-export/psd/blend";
import {
  applyLayerEffects,
  hasBehindEffects,
  hasEnabledEffects,
  hasForegroundEffects,
} from "$/import-export/psd/effects";
import {
  createSolidColorBuffer,
  rasterizeGradientFill,
  rasterizePatternFill,
} from "$/import-export/psd/fills";
import type {
  PsdArtboard,
  PsdDocument,
  PsdLayer,
  PsdMask,
  PsdPattern,
  PsdSlice,
} from "$/import-export/psd/model";
import {
  EDITOR_PSD_LIMITS,
  PsdCodecError,
  PsdIssueCode,
  type PsdResourceLimits,
} from "$/import-export/psd/signature";
import {
  resolveLayerFrameStates,
  resolvePsdAnimation,
  type ResolvedLayerState,
} from "$/import-export/psd/timeline";
import { rasterizeVectorMask } from "$/import-export/psd/vector-mask";
import type { SpriteSlice } from "$/sprite";
import {
  assertLayerHierarchy,
  LAYER_COLLAPSED,
  LAYER_EDITABLE,
  LAYER_LOCK_MOVE,
  LAYER_VISIBLE,
  renderTimelineFrame,
  type SpriteTimeline,
  type TimelineCel,
  type TimelineFrame,
  type TimelineLayer,
} from "$/timeline";

const RGBA_CHANNELS = 4;
const DEFAULT_LAYER_NAME = "Layer 1";
const BACKGROUND_LAYER_NAME = "Background";
const PASS_THROUGH_BLEND_MODE = "pass through";
const NORMAL_BLEND_MODE = "normal";

/** Maps Photoshop blend-mode names onto Xprite/Aseprite `BLEND_MODES` indices (0..18). */
const PSD_TO_XPRITE_BLEND_MODE: Readonly<Record<string, number>> = {
  normal: 0,
  "pass through": 0,
  multiply: 1,
  screen: 2,
  overlay: 3,
  darken: 4,
  lighten: 5,
  "color dodge": 6,
  "color burn": 7,
  "hard light": 8,
  "soft light": 9,
  difference: 10,
  exclusion: 11,
  hue: 12,
  saturation: 13,
  color: 14,
  luminosity: 15,
  "linear dodge": 16,
  subtract: 17,
  divide: 18,
};

interface RasterRect {
  readonly x: number;
  readonly y: number;
  readonly pixels: PixelBuffer;
}

interface FlattenedNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: "image" | "group";
  readonly source: PsdLayer;
  raster: RasterRect | null;
  readonly hasBakedEffects: boolean;
  readonly opaqueCover?: boolean;
  readonly frameStates: readonly ResolvedLayerState[];
  readonly effectiveVisible: readonly boolean[];
}

function clampByte(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= UINT8_MAX) return UINT8_MAX;
  return Math.round(value);
}

function mapBlendMode(blendMode: string | undefined): number {
  if (!blendMode) return 0;
  return PSD_TO_XPRITE_BLEND_MODE[blendMode.toLowerCase()] ?? 0;
}

function maskIntensity(mask: PsdMask, docX: number, docY: number): number {
  let raw = clampByte(mask.defaultColor);
  const maskPixels = mask.pixels;
  if (
    maskPixels &&
    docX >= mask.left &&
    docX < mask.left + maskPixels.width &&
    docY >= mask.top &&
    docY < mask.top + maskPixels.height
  ) {
    const mx = docX - mask.left;
    const my = docY - mask.top;
    raw = maskPixels.data[(my * maskPixels.width + mx) * RGBA_CHANNELS];
  }
  const density = mask.density;
  if (density !== undefined && density >= 0 && density < 1) {
    return clampByte(UINT8_MAX - (UINT8_MAX - raw) * density);
  }
  return raw;
}

function combinedMaskIntensityAt(
  layer: PsdLayer,
  vectorMaskPixels: PixelBuffer | null,
): ((docX: number, docY: number) => number) | undefined {
  const hasMask = Boolean(layer.mask && !layer.mask.disabled);
  const hasReal = Boolean(layer.realMask && !layer.realMask.disabled);
  const hasVec = Boolean(vectorMaskPixels);
  if (!hasMask && !hasReal && !hasVec) return undefined;
  return (docX: number, docY: number): number => {
    let alpha = UINT8_MAX;
    if (hasMask && layer.mask) alpha = mulUn8(alpha, maskIntensity(layer.mask, docX, docY));
    if (hasReal && layer.realMask) alpha = mulUn8(alpha, maskIntensity(layer.realMask, docX, docY));
    if (hasVec && vectorMaskPixels) {
      if (
        docX >= 0 &&
        docX < vectorMaskPixels.width &&
        docY >= 0 &&
        docY < vectorMaskPixels.height
      ) {
        alpha = mulUn8(
          alpha,
          vectorMaskPixels.data[(docY * vectorMaskPixels.width + docX) * RGBA_CHANNELS],
        );
      } else {
        alpha = 0;
      }
    }
    return alpha;
  };
}

function applyMaskToRaster(
  raster: RasterRect,
  mask: PsdMask | undefined,
  canvasWidth: number,
  canvasHeight: number,
): RasterRect | null {
  if (!mask || mask.disabled) return raster;

  const srcLeft = raster.x;
  const srcTop = raster.y;
  const srcRight = raster.x + raster.pixels.width;
  const srcBottom = raster.y + raster.pixels.height;

  const maskDefault = clampByte(mask.defaultColor);
  const density =
    mask.density !== undefined && mask.density >= 0 && mask.density < 1 ? mask.density : 1;
  const hasDensity = density < 1;
  const outsideAlpha = hasDensity
    ? clampByte(UINT8_MAX - (UINT8_MAX - maskDefault) * density)
    : maskDefault;

  const maskPixels = mask.pixels;
  const hasMaskPixels = Boolean(maskPixels && maskPixels.width > 0 && maskPixels.height > 0);
  if (!hasMaskPixels) {
    if (outsideAlpha === UINT8_MAX) return raster;
    if (outsideAlpha === 0) return null;
  }

  let outLeft = srcLeft;
  let outTop = srcTop;
  let outRight = srcRight;
  let outBottom = srcBottom;

  if (outsideAlpha === 0 && maskPixels) {
    outLeft = Math.max(srcLeft, mask.left);
    outTop = Math.max(srcTop, mask.top);
    outRight = Math.min(srcRight, mask.left + maskPixels.width);
    outBottom = Math.min(srcBottom, mask.top + maskPixels.height);
    if (outRight <= outLeft || outBottom <= outTop) return null;
  }

  const outWidth = outRight - outLeft;
  const outHeight = outBottom - outTop;
  if (outWidth <= 0 || outHeight <= 0 || outWidth > canvasWidth * 4 || outHeight > canvasHeight * 4)
    return null;

  const outData = new Uint8ClampedArray(outWidth * outHeight * RGBA_CHANNELS);
  const srcData = raster.pixels.data;
  const srcWidth = raster.pixels.width;
  const maskLeft = mask.left;
  const maskTop = mask.top;
  const maskWidth = maskPixels ? maskPixels.width : 0;
  const maskHeight = maskPixels ? maskPixels.height : 0;
  const maskRight = maskLeft + maskWidth;
  const maskBottom = maskTop + maskHeight;
  const maskData = maskPixels ? maskPixels.data : null;

  let minX = outWidth;
  let minY = outHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < outHeight; y++) {
    const docY = outTop + y;
    const sy = docY - srcTop;
    const srcRowBase = sy * srcWidth - srcLeft;
    const dstRowBase = y * outWidth;
    const yInMask = maskData !== null && docY >= maskTop && docY < maskBottom;
    const maskRowBase = yInMask ? (docY - maskTop) * maskWidth - maskLeft : 0;

    for (let x = 0; x < outWidth; x++) {
      const docX = outLeft + x;
      const srcOffset = (srcRowBase + docX) * RGBA_CHANNELS;
      const srcAlpha = srcData[srcOffset + 3];
      if (srcAlpha === 0) continue;

      let mAlpha: number;
      if (yInMask && docX >= maskLeft && docX < maskRight) {
        const raw = maskData![(maskRowBase + docX) * RGBA_CHANNELS];
        mAlpha = hasDensity ? clampByte(UINT8_MAX - (UINT8_MAX - raw) * density) : raw;
      } else {
        mAlpha = outsideAlpha;
      }
      if (mAlpha === 0) continue;

      const finalAlpha = mAlpha === UINT8_MAX ? srcAlpha : mulUn8(srcAlpha, mAlpha);
      if (finalAlpha === 0) continue;

      const dstOffset = (dstRowBase + x) * RGBA_CHANNELS;
      outData[dstOffset] = srcData[srcOffset];
      outData[dstOffset + 1] = srcData[srcOffset + 1];
      outData[dstOffset + 2] = srcData[srcOffset + 2];
      outData[dstOffset + 3] = finalAlpha;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;

  // Compact sparse masked layers into a tight bounding box to cut downstream clipping/rendering/RAM.
  const tightW = maxX - minX + 1;
  const tightH = maxY - minY + 1;
  if (tightW * tightH * 4 < outWidth * outHeight * 3) {
    const compact = new Uint8ClampedArray(tightW * tightH * RGBA_CHANNELS);
    for (let y = 0; y < tightH; y++) {
      const srcStart = ((minY + y) * outWidth + minX) * RGBA_CHANNELS;
      compact.set(
        outData.subarray(srcStart, srcStart + tightW * RGBA_CHANNELS),
        y * tightW * RGBA_CHANNELS,
      );
    }
    return {
      x: outLeft + minX,
      y: outTop + minY,
      pixels: { width: tightW, height: tightH, data: compact },
    };
  }

  return { x: outLeft, y: outTop, pixels: { width: outWidth, height: outHeight, data: outData } };
}

function resolveLayerRaster(
  layer: PsdLayer,
  canvasWidth: number,
  canvasHeight: number,
  patterns: ReadonlyMap<string, PsdPattern>,
): RasterRect | null {
  const hasPreRasterizedShape = Boolean(
    layer.pixels &&
    layer.pixels.width > 0 &&
    layer.pixels.height > 0 &&
    (layer.solidColor || layer.gradientFill || layer.patternFill),
  );
  const needsVectorMask = Boolean(
    layer.vectorMask &&
    !layer.vectorMask.disabled &&
    !hasPreRasterizedShape &&
    !(layer.mask && !layer.mask.disabled && layer.mask.pixels),
  );
  const vectorMaskPixels = needsVectorMask
    ? rasterizeVectorMask(layer.vectorMask, canvasWidth, canvasHeight)
    : null;

  let base: RasterRect | null = null;
  if (layer.pixels && layer.pixels.width > 0 && layer.pixels.height > 0) {
    base = { x: Math.round(layer.left), y: Math.round(layer.top), pixels: layer.pixels };
  } else if (layer.gradientFill) {
    const rectWidth = Math.round(layer.right - layer.left);
    const rectHeight = Math.round(layer.bottom - layer.top);
    const useRect = rectWidth > 0 && rectHeight > 0;
    const width = useRect ? rectWidth : canvasWidth;
    const height = useRect ? rectHeight : canvasHeight;
    base = {
      x: useRect ? Math.round(layer.left) : 0,
      y: useRect ? Math.round(layer.top) : 0,
      pixels: rasterizeGradientFill(layer.gradientFill, width, height),
    };
  } else if (layer.patternFill) {
    const rectWidth = Math.round(layer.right - layer.left);
    const rectHeight = Math.round(layer.bottom - layer.top);
    const useRect = rectWidth > 0 && rectHeight > 0;
    const x = useRect ? Math.round(layer.left) : 0;
    const y = useRect ? Math.round(layer.top) : 0;
    const width = useRect ? rectWidth : canvasWidth;
    const height = useRect ? rectHeight : canvasHeight;
    const filled = rasterizePatternFill(layer.patternFill, patterns, width, height, x, y);
    if (filled) base = { x, y, pixels: filled };
  } else if (
    layer.solidColor &&
    (!layer.vectorMask ||
      layer.vectorMask.disabled ||
      vectorMaskPixels ||
      layer.mask ||
      layer.realMask)
  ) {
    const rectWidth = Math.round(layer.right - layer.left);
    const rectHeight = Math.round(layer.bottom - layer.top);
    const useRect = rectWidth > 0 && rectHeight > 0;
    base = {
      x: useRect ? Math.round(layer.left) : 0,
      y: useRect ? Math.round(layer.top) : 0,
      pixels: createSolidColorBuffer(
        useRect ? rectWidth : canvasWidth,
        useRect ? rectHeight : canvasHeight,
        layer.solidColor,
      ),
    };
  }
  if (!base) return null;

  let current: RasterRect | null = applyMaskToRaster(base, layer.mask, canvasWidth, canvasHeight);
  if (!current) return null;
  current = applyMaskToRaster(current, layer.realMask, canvasWidth, canvasHeight);
  if (!current) return null;
  if (vectorMaskPixels) {
    current = applyMaskToRaster(
      current,
      {
        left: 0,
        top: 0,
        right: canvasWidth,
        bottom: canvasHeight,
        defaultColor: layer.vectorMask?.invert ? UINT8_MAX : 0,
        disabled: false,
        pixels: vectorMaskPixels,
      },
      canvasWidth,
      canvasHeight,
    );
    if (current) current = trimTransparentRect(current);
  }
  return current;
}

function isFullyOpaque(pixels: PixelBuffer): boolean {
  const data = pixels.data;
  for (let i = 3; i < data.length; i += RGBA_CHANNELS) {
    if (data[i] !== UINT8_MAX) return false;
  }
  return true;
}

function trimTransparentRect(raster: RasterRect): RasterRect | null {
  const { width, height, data } = raster.pixels;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (data[(row + x) * RGBA_CHANNELS + 3] !== 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  if (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1) return raster;
  const outW = maxX - minX + 1;
  const outH = maxY - minY + 1;
  const outData = new Uint8ClampedArray(outW * outH * RGBA_CHANNELS);
  for (let y = 0; y < outH; y++) {
    const srcStart = ((minY + y) * width + minX) * RGBA_CHANNELS;
    outData.set(data.subarray(srcStart, srcStart + outW * RGBA_CHANNELS), y * outW * RGBA_CHANNELS);
  }
  return {
    x: raster.x + minX,
    y: raster.y + minY,
    pixels: { width: outW, height: outH, data: outData },
  };
}

function clipRasterToRect(raster: RasterRect, rect: PsdArtboard | null): RasterRect | null {
  if (!rect) return raster;
  const left = Math.max(raster.x, Math.round(rect.left));
  const top = Math.max(raster.y, Math.round(rect.top));
  const right = Math.min(raster.x + raster.pixels.width, Math.round(rect.right));
  const bottom = Math.min(raster.y + raster.pixels.height, Math.round(rect.bottom));
  if (right <= left || bottom <= top) return null;
  if (
    left === raster.x &&
    top === raster.y &&
    right === raster.x + raster.pixels.width &&
    bottom === raster.y + raster.pixels.height
  ) {
    return raster;
  }
  const outWidth = right - left;
  const outHeight = bottom - top;
  const outData = new Uint8ClampedArray(outWidth * outHeight * RGBA_CHANNELS);
  const src = raster.pixels.data;
  const srcWidth = raster.pixels.width;
  for (let y = 0; y < outHeight; y++) {
    const srcStart = ((top + y - raster.y) * srcWidth + (left - raster.x)) * RGBA_CHANNELS;
    outData.set(
      src.subarray(srcStart, srcStart + outWidth * RGBA_CHANNELS),
      y * outWidth * RGBA_CHANNELS,
    );
  }
  return { x: left, y: top, pixels: { width: outWidth, height: outHeight, data: outData } };
}

function clipRasterToBase(raster: RasterRect, base: RasterRect | null): RasterRect | null {
  if (!base) return null;
  const left = Math.max(raster.x, base.x);
  const top = Math.max(raster.y, base.y);
  const right = Math.min(raster.x + raster.pixels.width, base.x + base.pixels.width);
  const bottom = Math.min(raster.y + raster.pixels.height, base.y + base.pixels.height);
  if (right <= left || bottom <= top) return null;

  const outWidth = right - left;
  const outHeight = bottom - top;
  const outData = new Uint8ClampedArray(outWidth * outHeight * RGBA_CHANNELS);
  const srcData = raster.pixels.data;
  const srcWidth = raster.pixels.width;
  const baseData = base.pixels.data;
  const baseWidth = base.pixels.width;

  for (let y = 0; y < outHeight; y++) {
    const docY = top + y;
    const sy = docY - raster.y;
    const by = docY - base.y;
    for (let x = 0; x < outWidth; x++) {
      const docX = left + x;
      const sx = docX - raster.x;
      const bx = docX - base.x;
      const srcOffset = (sy * srcWidth + sx) * RGBA_CHANNELS;
      const srcAlpha = srcData[srcOffset + 3];
      if (srcAlpha === 0) continue;
      const baseAlpha = baseData[(by * baseWidth + bx) * RGBA_CHANNELS + 3];
      const finalAlpha = mulUn8(srcAlpha, baseAlpha);
      if (finalAlpha === 0) continue;
      const dstOffset = (y * outWidth + x) * RGBA_CHANNELS;
      outData[dstOffset] = srcData[srcOffset];
      outData[dstOffset + 1] = srcData[srcOffset + 1];
      outData[dstOffset + 2] = srcData[srcOffset + 2];
      outData[dstOffset + 3] = finalAlpha;
    }
  }

  return { x: left, y: top, pixels: { width: outWidth, height: outHeight, data: outData } };
}

function compositeNodesRange(
  nodes: readonly FlattenedNode[],
  fromIndex: number,
  toIndex: number,
  regionWidth: number,
  regionHeight: number,
  regionX = 0,
  regionY = 0,
): PixelBuffer {
  const out = new Uint8ClampedArray(regionWidth * regionHeight * RGBA_CHANNELS);
  const visibleMap = new Map<string, boolean>();
  for (let i = 0; i < toIndex; i++) {
    const node = nodes[i];
    const parentOk = node.parentId ? (visibleMap.get(node.parentId) ?? true) : true;
    visibleMap.set(node.id, parentOk && !node.source.hidden);
  }

  // Skip layers completely occluded by a later full-region opaque Normal layer (e.g. stacked adjustments).
  let startIndex = fromIndex;
  const regionRight = regionX + regionWidth;
  const regionBottom = regionY + regionHeight;
  for (let i = toIndex - 1; i >= fromIndex; i--) {
    const node = nodes[i];
    if (
      node.opaqueCover &&
      node.raster &&
      visibleMap.get(node.id) &&
      node.raster.x <= regionX &&
      node.raster.y <= regionY &&
      node.raster.x + node.raster.pixels.width >= regionRight &&
      node.raster.y + node.raster.pixels.height >= regionBottom
    ) {
      startIndex = i;
      break;
    }
  }

  for (let i = startIndex; i < toIndex; i++) {
    const node = nodes[i];
    if (node.kind === "group" || !node.raster) continue;
    if (!visibleMap.get(node.id)) continue;
    const raster = node.raster;
    const left = Math.max(regionX, raster.x);
    const top = Math.max(regionY, raster.y);
    const right = Math.min(regionRight, raster.x + raster.pixels.width);
    const bottom = Math.min(regionBottom, raster.y + raster.pixels.height);
    if (right <= left || bottom <= top) continue;

    const opacity = node.hasBakedEffects
      ? clampByte(node.source.opacity)
      : mulUn8(clampByte(node.source.opacity), clampByte(node.source.fillOpacity));
    if (opacity === 0) continue;
    const mode = mapBlendMode(node.source.blendMode);
    const src = raster.pixels.data;
    const srcW = raster.pixels.width;

    // Fast copy when starting from a full-region opaque Normal layer on empty output.
    if (
      i === startIndex &&
      node.opaqueCover &&
      left === regionX &&
      top === regionY &&
      right === regionRight &&
      bottom === regionBottom
    ) {
      if (raster.x === regionX && raster.y === regionY && srcW === regionWidth) {
        out.set(src.subarray(0, out.length));
      } else {
        for (let y = 0; y < regionHeight; y++) {
          const srcStart = ((regionY + y - raster.y) * srcW + (regionX - raster.x)) * RGBA_CHANNELS;
          out.set(
            src.subarray(srcStart, srcStart + regionWidth * RGBA_CHANNELS),
            y * regionWidth * RGBA_CHANNELS,
          );
        }
      }
      continue;
    }

    for (let y = top; y < bottom; y++) {
      const sy = y - raster.y;
      const dy = y - regionY;
      for (let x = left; x < right; x++) {
        const sx = x - raster.x;
        const from = (sy * srcW + sx) * RGBA_CHANNELS;
        if (src[from + 3] === 0) continue;
        blendAt(out, (dy * regionWidth + (x - regionX)) * RGBA_CHANNELS, src, from, opacity, mode);
      }
    }
  }
  return { width: regionWidth, height: regionHeight, data: out };
}

function rgbaToHex(color: Rgba): string {
  const toHex = (value: number) => clampByte(value).toString(16).padStart(2, "0");
  return `#${toHex(color[0])}${toHex(color[1])}${toHex(color[2])}`;
}

function convertSlices(slices: readonly PsdSlice[] | undefined): SpriteSlice[] | undefined {
  if (!slices?.length) return undefined;
  const out: SpriteSlice[] = [];
  for (const slice of slices) {
    const width = Math.round(slice.right - slice.left);
    const height = Math.round(slice.bottom - slice.top);
    if (width <= 0 || height <= 0 || slice.groupId <= 0) continue;
    out.push({
      id: `psd-slice-${slice.id}`,
      name: slice.name || `Slice ${slice.id}`,
      keys: [
        {
          frame: 0,
          bounds: {
            x: Math.round(slice.left),
            y: Math.round(slice.top),
            width,
            height,
          },
        },
      ],
      ...(slice.color ? { color: rgbaToHex(slice.color) } : {}),
    });
  }
  return out.length > 0 ? out : undefined;
}

function layerFlags(layer: PsdLayer, visible: boolean, isGroup: boolean): number {
  let flags = 0;
  if (visible) flags |= LAYER_VISIBLE;
  if (!layer.locked) flags |= LAYER_EDITABLE;
  if (layer.positionLocked) flags |= LAYER_LOCK_MOVE;
  if (isGroup && layer.opened === false) flags |= LAYER_COLLAPSED;
  return flags;
}

/** Converts a platform-independent decoded PSD model into an editable Xprite project. */
export function projectFromPsd(
  document: PsdDocument,
  options: { limits?: Partial<PsdResourceLimits> } = {},
): EditorProject {
  const limits: PsdResourceLimits = { ...EDITOR_PSD_LIMITS, ...options.limits };
  assertDimension(document.width, "PSD width");
  assertDimension(document.height, "PSD height");
  if (document.width > limits.maxWidth || document.height > limits.maxHeight) {
    throw new PsdCodecError(
      `PSD dimensions ${document.width}×${document.height} exceed the ${limits.maxWidth}×${limits.maxHeight} limit.`,
      PsdIssueCode.ResourceLimit,
    );
  }
  assertPixelCount(document.width, document.height, "PSD canvas");
  if (document.width * document.height > limits.maxPixels) {
    throw new PsdCodecError(
      `PSD canvas ${document.width}×${document.height} exceeds the ${limits.maxPixels} pixel limit.`,
      PsdIssueCode.ResourceLimit,
    );
  }

  const patterns = new Map<string, PsdPattern>();
  for (const pattern of document.patterns ?? []) patterns.set(pattern.id, pattern);

  const animation = resolvePsdAnimation(document, limits.maxFrames);
  const frameCount = animation.frames.length;
  const nodes: FlattenedNode[] = [];
  let nextLayerId = 0;
  let hasIsolatedGroup = false;

  const visitSiblings = (
    siblings: readonly PsdLayer[],
    parentId: string | null,
    parentVisible: readonly boolean[],
    scopeStartIndex: number,
    artboardClip: PsdArtboard | null,
  ): void => {
    let clippingBaseRaster: RasterRect | null = null;
    let clippingBaseNode: FlattenedNode | null = null;
    let pendingClipForeground: FlattenedNode | null = null;

    const flushClipForeground = (): void => {
      if (!pendingClipForeground) return;
      if (nodes.length < limits.maxLayers) nodes.push(pendingClipForeground);
      pendingClipForeground = null;
    };

    for (let siblingIndex = 0; siblingIndex < siblings.length; siblingIndex++) {
      const layer = siblings[siblingIndex];
      if (!layer.clipping) flushClipForeground();
      // Handle adjustment layers: hidden/unsupported are skipped; visible ones are baked.
      if (layer.adjustment) {
        if (layer.hidden || !isSupportedAdjustment(layer.adjustment)) continue;
        const adjOpacity = mulUn8(clampByte(layer.opacity), clampByte(layer.fillOpacity));
        if (adjOpacity === 0) continue;
        const vecMask =
          layer.vectorMask &&
          !layer.vectorMask.disabled &&
          !(layer.mask && !layer.mask.disabled && layer.mask.pixels)
            ? rasterizeVectorMask(layer.vectorMask, document.width, document.height)
            : null;
        const maskAt = combinedMaskIntensityAt(layer, vecMask);

        if (layer.clipping && clippingBaseNode && clippingBaseNode.raster) {
          const adjusted = applyAdjustmentToPixels(
            clippingBaseNode.raster.pixels,
            clippingBaseNode.raster.x,
            clippingBaseNode.raster.y,
            layer.adjustment,
            adjOpacity,
            maskAt,
          );
          clippingBaseNode.raster = {
            x: clippingBaseNode.raster.x,
            y: clippingBaseNode.raster.y,
            pixels: adjusted,
          };
          clippingBaseRaster = clippingBaseNode.raster;
          continue;
        }

        if (nodes.length >= limits.maxLayers) {
          throw new PsdCodecError(
            `PSD contains more than ${limits.maxLayers} layers.`,
            PsdIssueCode.ResourceLimit,
          );
        }
        const under = compositeNodesRange(
          nodes,
          scopeStartIndex,
          nodes.length,
          document.width,
          document.height,
        );
        const adjusted = applyAdjustmentToPixels(under, 0, 0, layer.adjustment, adjOpacity, maskAt);
        const frameStates = resolveLayerFrameStates(layer, animation, false);
        const effectiveVisible = frameStates.map(
          (state, index) => parentVisible[index] && state.enabled,
        );
        nodes.push({
          id: `psd-layer-${nextLayerId++}`,
          parentId,
          kind: "image",
          source: {
            ...layer,
            opacity: UINT8_MAX,
            fillOpacity: UINT8_MAX,
            blendMode: NORMAL_BLEND_MODE,
          },
          raster: { x: 0, y: 0, pixels: adjusted },
          hasBakedEffects: false,
          opaqueCover: isFullyOpaque(adjusted),
          frameStates,
          effectiveVisible,
        });
        continue;
      }

      const isGroup = Array.isArray(layer.children);
      const effectsActive = hasEnabledEffects(layer.effects);
      const frameStates = resolveLayerFrameStates(layer, animation, effectsActive);
      const effectiveVisible = frameStates.map(
        (state, index) => parentVisible[index] && state.enabled,
      );

      if (nodes.length >= limits.maxLayers) {
        throw new PsdCodecError(
          `PSD contains more than ${limits.maxLayers} layers.`,
          PsdIssueCode.ResourceLimit,
        );
      }

      if (isGroup) {
        const groupId = `psd-layer-${nextLayerId++}`;
        const blendLower = layer.blendMode.toLowerCase();
        const groupOpacity = clampByte(layer.opacity);
        const isolated =
          groupOpacity < UINT8_MAX ||
          (blendLower !== PASS_THROUGH_BLEND_MODE && blendLower !== NORMAL_BLEND_MODE);
        if (isolated) hasIsolatedGroup = true;
        const groupIndex = nodes.length;
        nodes.push({
          id: groupId,
          parentId,
          kind: "group",
          source: layer,
          raster: null,
          hasBakedEffects: false,
          frameStates,
          effectiveVisible,
        });
        // Artboard background fill (when backgroundType is white/black/custom color).
        const artboard = layer.artboard ?? artboardClip;
        if (layer.artboard?.backgroundColor && nodes.length < limits.maxLayers) {
          const abLeft = Math.round(layer.artboard.left);
          const abTop = Math.round(layer.artboard.top);
          const abW = Math.round(layer.artboard.right) - abLeft;
          const abH = Math.round(layer.artboard.bottom) - abTop;
          if (abW > 0 && abH > 0) {
            nodes.push({
              id: `psd-layer-${nextLayerId++}`,
              parentId: groupId,
              kind: "image",
              source: {
                ...layer,
                name: `${layer.name || "Artboard"} (Background)`,
                opacity: UINT8_MAX,
                fillOpacity: UINT8_MAX,
                blendMode: NORMAL_BLEND_MODE,
              },
              raster: {
                x: abLeft,
                y: abTop,
                pixels: createSolidColorBuffer(abW, abH, layer.artboard.backgroundColor),
              },
              hasBakedEffects: false,
              frameStates,
              effectiveVisible,
            });
          }
        }
        // Non-pass-through groups scope adjustments to the group; pass-through groups see the document below.
        const childScopeStart =
          blendLower === PASS_THROUGH_BLEND_MODE && !layer.artboard
            ? scopeStartIndex
            : groupIndex + 1;
        visitSiblings(layer.children ?? [], groupId, effectiveVisible, childScopeStart, artboard);

        const needsGroupEffects = effectsActive && !layer.hidden;
        const needsGroupClipping = !layer.clipping && Boolean(siblings[siblingIndex + 1]?.clipping);
        const groupComposite =
          needsGroupEffects || needsGroupClipping
            ? compositeNodesRange(
                nodes,
                groupIndex + 1,
                nodes.length,
                document.width,
                document.height,
              )
            : null;
        if (needsGroupEffects && groupComposite) {
          const trimmedGroup = trimTransparentRect({ x: 0, y: 0, pixels: groupComposite });
          if (trimmedGroup) {
            if (hasBehindEffects(layer.effects) && nodes.length < limits.maxLayers) {
              const behind = applyLayerEffects(
                trimmedGroup,
                layer.effects,
                0,
                patterns,
                mapBlendMode,
                "behind",
              );
              nodes.splice(groupIndex + 1, 0, {
                id: `psd-layer-${nextLayerId++}`,
                parentId: groupId,
                kind: "image",
                source: {
                  ...layer,
                  name: `${layer.name || "Group"} (Shadow/Glow)`,
                  opacity: UINT8_MAX,
                  fillOpacity: UINT8_MAX,
                  blendMode: NORMAL_BLEND_MODE,
                },
                raster: behind,
                hasBakedEffects: true,
                frameStates,
                effectiveVisible,
              });
            }
            if (hasForegroundEffects(layer.effects) && nodes.length < limits.maxLayers) {
              const foreground = applyLayerEffects(
                trimmedGroup,
                layer.effects,
                0,
                patterns,
                mapBlendMode,
                "foreground",
              );
              nodes.push({
                id: `psd-layer-${nextLayerId++}`,
                parentId: groupId,
                kind: "image",
                source: {
                  ...layer,
                  name: `${layer.name || "Group"} (Overlay/Stroke)`,
                  opacity: UINT8_MAX,
                  fillOpacity: UINT8_MAX,
                  blendMode: NORMAL_BLEND_MODE,
                },
                raster: foreground,
                hasBakedEffects: true,
                frameStates,
                effectiveVisible,
              });
            }
          }
        }
        if (!layer.clipping) {
          clippingBaseRaster = groupComposite ? { x: 0, y: 0, pixels: groupComposite } : null;
          clippingBaseNode = null;
        }
        continue;
      }

      const rawRaster = resolveLayerRaster(layer, document.width, document.height, patterns);
      let finalRaster =
        rawRaster && layer.clipping ? clipRasterToBase(rawRaster, clippingBaseRaster) : rawRaster;
      const nextSibling = siblings[siblingIndex + 1];
      const deferForegroundToClipped = Boolean(
        finalRaster &&
        !layer.clipping &&
        !layer.hidden &&
        effectsActive &&
        hasForegroundEffects(layer.effects) &&
        layer.blendClippedElements !== false &&
        layer.blendInteriorElements !== true &&
        nextSibling?.clipping &&
        !nextSibling.adjustment,
      );
      let nodeBakedEffects = false;
      if (finalRaster && effectsActive) {
        if (deferForegroundToClipped) {
          if (hasBehindEffects(layer.effects)) {
            const behindOnly = {
              disabled: layer.effects?.disabled,
              dropShadows: layer.effects?.dropShadows,
              outerGlow: layer.effects?.outerGlow,
              strokes: layer.effects?.strokes?.filter((stroke) => stroke.position === "outside"),
            };
            finalRaster = applyLayerEffects(
              finalRaster,
              behindOnly,
              clampByte(layer.fillOpacity),
              patterns,
              mapBlendMode,
            );
            nodeBakedEffects = true;
          }
          const foregroundRaster = clipRasterToRect(
            applyLayerEffects(rawRaster!, layer.effects, 0, patterns, mapBlendMode, "foreground"),
            artboardClip,
          );
          if (foregroundRaster) {
            pendingClipForeground = {
              id: `psd-layer-${nextLayerId++}`,
              parentId,
              kind: "image",
              source: {
                ...layer,
                name: `${layer.name || DEFAULT_LAYER_NAME} (Effects)`,
                fillOpacity: UINT8_MAX,
                blendMode: NORMAL_BLEND_MODE,
              },
              raster: foregroundRaster,
              hasBakedEffects: true,
              frameStates,
              effectiveVisible,
            };
          }
        } else {
          finalRaster = applyLayerEffects(
            finalRaster,
            layer.effects,
            clampByte(layer.fillOpacity),
            patterns,
            mapBlendMode,
            "all",
            Boolean(layer.blendInteriorElements),
          );
          nodeBakedEffects = true;
        }
      }

      if (finalRaster && artboardClip) {
        finalRaster = clipRasterToRect(finalRaster, artboardClip);
      }

      // Bake the 8 Photoshop-only blend modes absent from Xprite's 19-mode compositor.
      let nodeSource = layer;
      if (finalRaster && !layer.hidden && isUnsupportedXpriteBlendMode(layer.blendMode)) {
        const effectiveOp = nodeBakedEffects
          ? clampByte(layer.opacity)
          : mulUn8(clampByte(layer.opacity), clampByte(layer.fillOpacity));
        const backdrop = compositeNodesRange(
          nodes,
          scopeStartIndex,
          nodes.length,
          finalRaster.pixels.width,
          finalRaster.pixels.height,
          finalRaster.x,
          finalRaster.y,
        );
        finalRaster = {
          x: finalRaster.x,
          y: finalRaster.y,
          pixels: bakeExtraPsdBlendMode(
            backdrop,
            finalRaster.pixels,
            finalRaster.x,
            finalRaster.y,
            effectiveOp,
            layer.blendMode,
            finalRaster.x,
            finalRaster.y,
          ),
        };
        nodeSource = {
          ...layer,
          opacity: UINT8_MAX,
          fillOpacity: UINT8_MAX,
          blendMode: NORMAL_BLEND_MODE,
        };
        nodeBakedEffects = true;
      }

      const node: FlattenedNode = {
        id: `psd-layer-${nextLayerId++}`,
        parentId,
        kind: "image",
        source: nodeSource,
        raster: finalRaster,
        hasBakedEffects: nodeBakedEffects,
        frameStates,
        effectiveVisible,
      };
      nodes.push(node);

      if (!layer.clipping) {
        clippingBaseRaster = rawRaster;
        clippingBaseNode = node;
      }
    }
    flushClipForeground();
  };

  const rootVisible = animation.frames.map(() => true);
  if (document.children?.length) {
    visitSiblings(document.children, null, rootVisible, 0, null);
  }

  // Fallback for flattened PSDs (no layer records) or adjustment-only documents.
  if (nodes.length === 0) {
    const fallbackPixels =
      document.composite &&
      document.composite.width === document.width &&
      document.composite.height === document.height
        ? document.composite
        : {
            width: document.width,
            height: document.height,
            data: new Uint8ClampedArray(document.width * document.height * RGBA_CHANNELS),
          };
    const fallbackLayer: PsdLayer = {
      name: document.composite ? BACKGROUND_LAYER_NAME : DEFAULT_LAYER_NAME,
      left: 0,
      top: 0,
      right: document.width,
      bottom: document.height,
      hidden: false,
      opacity: UINT8_MAX,
      fillOpacity: UINT8_MAX,
      blendMode: NORMAL_BLEND_MODE,
      clipping: false,
      locked: false,
      positionLocked: false,
      pixels: fallbackPixels,
    };
    nodes.push({
      id: "psd-layer-0",
      parentId: null,
      kind: "image",
      source: fallbackLayer,
      raster: { x: 0, y: 0, pixels: fallbackPixels },
      hasBakedEffects: false,
      frameStates: animation.frames.map(() => ({
        enabled: true,
        offsetX: 0,
        offsetY: 0,
        opacity: UINT8_MAX,
      })),
      effectiveVisible: animation.frames.map(() => true),
    });
  }

  const isAnimated = frameCount > 1;
  const timelineLayers: TimelineLayer[] = nodes.map((node) => {
    const visible = isAnimated ? node.effectiveVisible.some(Boolean) : !node.source.hidden;
    const baseOpacity =
      node.kind === "group" || node.hasBakedEffects
        ? clampByte(node.source.opacity)
        : mulUn8(clampByte(node.source.opacity), clampByte(node.source.fillOpacity));
    return {
      id: node.id,
      name: node.source.name || DEFAULT_LAYER_NAME,
      kind: node.kind,
      parentId: node.parentId,
      visible,
      locked: node.source.locked,
      opacity: isAnimated && node.kind === "image" ? UINT8_MAX : baseOpacity,
      blendMode: mapBlendMode(node.source.blendMode),
      flags: layerFlags(node.source, visible, node.kind === "group"),
    };
  });

  const timelineFrames: TimelineFrame[] = animation.frames.map((frame, frameIndex) => ({
    duration: frame.durationMs,
    cels: nodes.map((node): TimelineCel | null => {
      if (node.kind === "group" || !node.raster) return null;
      if (isAnimated && !node.effectiveVisible[frameIndex]) return null;
      const state = node.frameStates[frameIndex];
      return {
        pixels: node.raster.pixels,
        x: node.raster.x + state.offsetX,
        y: node.raster.y + state.offsetY,
        opacity: isAnimated ? state.opacity : UINT8_MAX,
        zIndex: 0,
      };
    }),
  }));

  let activeLayer = 0;
  for (let i = timelineLayers.length - 1; i >= 0; i--) {
    if (timelineLayers[i].kind !== "group" && timelineLayers[i].visible) {
      activeLayer = i;
      break;
    }
  }
  if (timelineLayers[activeLayer]?.kind === "group") {
    const firstImage = timelineLayers.findIndex((layer) => layer.kind !== "group");
    if (firstImage >= 0) activeLayer = firstImage;
  }

  const slices = convertSlices(document.slices);
  const timeline: SpriteTimeline = {
    ...(animation.loopCount !== undefined ? { loopCount: animation.loopCount } : {}),
    ...(slices ? { slices } : {}),
    ...(hasIsolatedGroup ? { composeGroups: true } : {}),
    colorDepth: 32,
    layers: timelineLayers,
    frames: timelineFrames,
    activeLayer,
    activeFrame: 0,
  };

  assertLayerHierarchy(timeline);
  assertTimelineMemoryBudget(timeline, document.width, document.height, limits.maxDecodedBytes);

  const image = renderTimelineFrame(timeline, document.width, document.height, 0);
  const palette = document.palette?.length
    ? document.palette.map((color) => [...color] as Rgba)
    : undefined;

  return {
    image,
    timeline,
    directOpen: true,
    ...(palette ? { palette } : {}),
  };
}
