import {
  CANVAS_ENCODE_SAFE_PIXELS,
  CANVAS_IMAGE_MAX_DIMENSION,
} from "@xprite/bedrock/common/image-dimensions";
import { tiledCanvasLayout, type Rect, type TiledMode } from "@xprite/editor-core";

const RASTER_EDGE_MARGIN = 1;
const RASTER_PHASE_GRID = 64;
const MAX_EXACT_RASTER_COORDINATE = 32768;
const CROPPED_UPLOAD_OVERSCAN = 256;
const RGBA_CHANNELS = 4;

export interface SafeCanvasLimits {
  readonly maxDimension: number;
  readonly maxPixels: number;
}

export const SAFE_CANVAS_UPLOAD_LIMITS: Readonly<SafeCanvasLimits> = {
  maxDimension: CANVAS_IMAGE_MAX_DIMENSION,
  maxPixels: CANVAS_ENCODE_SAFE_PIXELS,
};

export enum RasterUploadMode {
  Full = "full",
  Cropped = "cropped",
  Viewport = "viewport",
}

export interface RasterUploadRect {
  x: number;
  y: number;
  width: number;
  height: number;
  writeX: number;
  writeY: number;
}

export interface RasterUploadViewport {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly origin: { readonly x: number; readonly y: number };
  readonly zoom: number;
  readonly backingScale: number;
  readonly backingViewportRect: Rect;
  readonly tiledMode: TiledMode;
}

export interface RasterUploadPlanInput {
  readonly raster: {
    readonly x: number;
    readonly y: number;
    readonly pixels: { readonly width: number; readonly height: number };
  };
  readonly document: { readonly width: number; readonly height: number };
  readonly view: RasterUploadViewport;
  readonly cachedCroppedRect?: Rect | null;
  readonly limits?: Readonly<SafeCanvasLimits>;
}

interface FullRasterUploadPlan extends RasterUploadRect {
  readonly mode: RasterUploadMode.Full;
}

interface CroppedRasterUploadPlan extends RasterUploadRect {
  readonly mode: RasterUploadMode.Cropped;
  readonly fullRect: Rect;
  readonly visibleRect: Rect;
}

export interface ViewportRasterUploadPlan {
  readonly mode: RasterUploadMode.Viewport;
  readonly dstX: number;
  readonly dstY: number;
  readonly dstWidth: number;
  readonly dstHeight: number;
  readonly width: number;
  readonly height: number;
  readonly tileBounds: Rect;
}

export type RasterUploadPlan =
  | FullRasterUploadPlan
  | CroppedRasterUploadPlan
  | ViewportRasterUploadPlan;

export interface RasterPixelSource {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface ViewportSampleMaps {
  readonly colMap: Int32Array;
  readonly rowMap: Int32Array;
}

function fitsCanvasLimits(
  width: number,
  height: number,
  limits: Readonly<SafeCanvasLimits>,
): boolean {
  return (
    width <= limits.maxDimension &&
    height <= limits.maxDimension &&
    width * height <= limits.maxPixels
  );
}

function edgePadding(scale: number): number {
  return Math.max(RASTER_EDGE_MARGIN, Math.ceil(1 / scale)) + RASTER_EDGE_MARGIN;
}

function visibleRequiredRect(
  full: Rect,
  document: { readonly width: number; readonly height: number },
  view: Pick<RasterUploadViewport, "viewport" | "origin" | "zoom" | "backingScale" | "tiledMode">,
): { readonly visibleRect: Rect | null; readonly tileBounds: Rect } {
  const tiles = tiledCanvasLayout(document.width, document.height, view.tiledMode);
  const tileBounds: Rect = {
    x: tiles.mainTile.x ? -tiles.mainTile.x : 0,
    y: tiles.mainTile.y ? -tiles.mainTile.y : 0,
    width: tiles.width,
    height: tiles.height,
  };
  const scale = view.zoom * view.backingScale;
  const padding = edgePadding(scale);
  const fullRight = full.x + full.width;
  const fullBottom = full.y + full.height;
  let reqLeft = Number.POSITIVE_INFINITY;
  let reqTop = Number.POSITIVE_INFINITY;
  let reqRight = Number.NEGATIVE_INFINITY;
  let reqBottom = Number.NEGATIVE_INFINITY;
  for (const tile of tiles.tiles) {
    const offsetX = tile.x - tiles.mainTile.x;
    const offsetY = tile.y - tiles.mainTile.y;
    const docLeft = -view.origin.x / view.zoom - offsetX;
    const docTop = -view.origin.y / view.zoom - offsetY;
    const docRight = (view.viewport.width - view.origin.x) / view.zoom - offsetX;
    const docBottom = (view.viewport.height - view.origin.y) / view.zoom - offsetY;
    const visLeft = Math.max(full.x, Math.floor(docLeft));
    const visTop = Math.max(full.y, Math.floor(docTop));
    const visRight = Math.min(fullRight, Math.ceil(docRight));
    const visBottom = Math.min(fullBottom, Math.ceil(docBottom));
    if (visRight <= visLeft || visBottom <= visTop) continue;
    reqLeft = Math.min(reqLeft, Math.max(full.x, visLeft - padding));
    reqTop = Math.min(reqTop, Math.max(full.y, visTop - padding));
    reqRight = Math.max(reqRight, Math.min(fullRight, visRight + padding));
    reqBottom = Math.max(reqBottom, Math.min(fullBottom, visBottom + padding));
  }
  if (reqLeft >= reqRight || reqTop >= reqBottom) {
    return { visibleRect: null, tileBounds };
  }
  return {
    visibleRect: {
      x: reqLeft,
      y: reqTop,
      width: reqRight - reqLeft,
      height: reqBottom - reqTop,
    },
    tileBounds,
  };
}

function expandRectWithOverscan(
  required: Rect,
  full: Rect,
  overscan: number,
  limits: Readonly<SafeCanvasLimits>,
): Rect {
  const fullRight = full.x + full.width;
  const fullBottom = full.y + full.height;
  const reqRight = required.x + required.width;
  const reqBottom = required.y + required.height;

  const maxWidthForHeight = Math.min(
    limits.maxDimension,
    Math.floor(limits.maxPixels / Math.max(1, required.height)),
  );
  const maxExtraX = Math.max(0, maxWidthForHeight - required.width);
  const padLeft = Math.min(overscan, Math.floor(maxExtraX / 2), required.x - full.x);
  const padRight = Math.min(overscan, maxExtraX - padLeft, fullRight - reqRight);
  const x = required.x - padLeft;
  const width = required.width + padLeft + padRight;

  const maxHeightForWidth = Math.min(
    limits.maxDimension,
    Math.floor(limits.maxPixels / Math.max(1, width)),
  );
  const maxExtraY = Math.max(0, maxHeightForWidth - required.height);
  const padTop = Math.min(overscan, Math.floor(maxExtraY / 2), required.y - full.y);
  const padBottom = Math.min(overscan, maxExtraY - padTop, fullBottom - reqBottom);
  const y = required.y - padTop;
  const height = required.height + padTop + padBottom;

  return { x, y, width, height };
}

function clampCanvasDimensions(
  width: number,
  height: number,
  limits: Readonly<SafeCanvasLimits>,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  if (fitsCanvasLimits(width, height, limits)) return { width, height };
  const scale = Math.min(
    1,
    limits.maxDimension / width,
    limits.maxDimension / height,
    Math.sqrt(limits.maxPixels / (width * height)),
  );
  const clampedWidth = Math.max(1, Math.min(limits.maxDimension, Math.floor(width * scale)));
  const clampedHeight = Math.max(
    1,
    Math.min(
      limits.maxDimension,
      Math.floor(limits.maxPixels / clampedWidth),
      Math.floor(height * scale),
    ),
  );
  return { width: clampedWidth, height: clampedHeight };
}

function copyPixelRect(
  source: RasterPixelSource,
  target: RasterPixelSource,
  srcX: number,
  srcY: number,
  dstX: number,
  dstY: number,
  width: number,
  height: number,
): void {
  const rowBytes = width * RGBA_CHANNELS;
  const srcStride = source.width * RGBA_CHANNELS;
  const dstStride = target.width * RGBA_CHANNELS;
  let srcOffset = (srcY * source.width + srcX) * RGBA_CHANNELS;
  let dstOffset = (dstY * target.width + dstX) * RGBA_CHANNELS;
  for (let row = 0; row < height; row++) {
    target.data.set(source.data.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
    srcOffset += srcStride;
    dstOffset += dstStride;
  }
}

/** Dyadic transforms in this range retain the full-image browser sampling phase
 * when a cel is cropped. Other transforms keep the original document raster. */
export function canOffsetRaster(
  origin: { x: number; y: number },
  document: { width: number; height: number },
  scale: number,
) {
  return (
    Number.isInteger(Math.log2(scale)) &&
    Number.isInteger(origin.x * RASTER_PHASE_GRID) &&
    Number.isInteger(origin.y * RASTER_PHASE_GRID) &&
    Math.max(
      Math.abs(origin.x),
      Math.abs(origin.y),
      Math.abs(origin.x + document.width * scale),
      Math.abs(origin.y + document.height * scale),
    ) < MAX_EXACT_RASTER_COORDINATE
  );
}

/** A transparent margin keeps browser image-edge coverage away from cel pixels.
 * Clip the padded image to the document so its outer edges match the original
 * document composite, including fractional pan/zoom and off-canvas cels. */
export function rasterUploadLayout(
  raster: { x: number; y: number; pixels: { width: number; height: number } },
  document: { width: number; height: number },
  scale: number,
): RasterUploadRect {
  const padding = edgePadding(scale);
  const x = Math.max(0, Math.min(document.width, raster.x - padding));
  const y = Math.max(0, Math.min(document.height, raster.y - padding));
  const right = Math.max(x, Math.min(document.width, raster.x + raster.pixels.width + padding));
  const bottom = Math.max(y, Math.min(document.height, raster.y + raster.pixels.height + padding));
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
    writeX: raster.x - x,
    writeY: raster.y - y,
  };
}

/**
 * Plan a 2D canvas raster upload within browser-safe canvas limits.
 *
 * - Ordinary documents that already fit within safe limits preserve the exact
 *   full-raster upload layout with zero pan churn.
 * - Larger documents clip to the visible document region with a bounded overscan
 *   margin so panning and dirty-rect edits remain fast.
 * - When the visible document region itself exceeds safe limits (e.g. zoomed out
 *   on a wide document or spanning a tiled wrap seam), sample directly at
 *   backing viewport resolution.
 */
export function planRasterUpload(input: RasterUploadPlanInput): RasterUploadPlan {
  const limits = input.limits ?? SAFE_CANVAS_UPLOAD_LIMITS;
  const { raster, document, view } = input;
  const scale = view.zoom * view.backingScale;
  const full = rasterUploadLayout(raster, document, scale);
  if (fitsCanvasLimits(full.width, full.height, limits)) {
    return {
      mode: RasterUploadMode.Full,
      ...full,
    };
  }
  const fullRect: Rect = { x: full.x, y: full.y, width: full.width, height: full.height };
  const { visibleRect, tileBounds } = visibleRequiredRect(fullRect, document, view);
  if (!visibleRect) {
    return {
      mode: RasterUploadMode.Cropped,
      x: full.x,
      y: full.y,
      width: 0,
      height: 0,
      writeX: raster.x - full.x,
      writeY: raster.y - full.y,
      fullRect,
      visibleRect: { x: full.x, y: full.y, width: 0, height: 0 },
    };
  }
  if (fitsCanvasLimits(visibleRect.width, visibleRect.height, limits)) {
    const cached = input.cachedCroppedRect;
    const fullRight = full.x + full.width;
    const fullBottom = full.y + full.height;
    const reqRight = visibleRect.x + visibleRect.width;
    const reqBottom = visibleRect.y + visibleRect.height;
    if (
      cached &&
      cached.width > 0 &&
      cached.height > 0 &&
      cached.x >= full.x &&
      cached.y >= full.y &&
      cached.x + cached.width <= fullRight &&
      cached.y + cached.height <= fullBottom &&
      cached.x <= visibleRect.x &&
      cached.y <= visibleRect.y &&
      cached.x + cached.width >= reqRight &&
      cached.y + cached.height >= reqBottom &&
      fitsCanvasLimits(cached.width, cached.height, limits)
    ) {
      return {
        mode: RasterUploadMode.Cropped,
        x: cached.x,
        y: cached.y,
        width: cached.width,
        height: cached.height,
        writeX: raster.x - cached.x,
        writeY: raster.y - cached.y,
        fullRect,
        visibleRect,
      };
    }
    const expanded = expandRectWithOverscan(visibleRect, fullRect, CROPPED_UPLOAD_OVERSCAN, limits);
    return {
      mode: RasterUploadMode.Cropped,
      x: expanded.x,
      y: expanded.y,
      width: expanded.width,
      height: expanded.height,
      writeX: raster.x - expanded.x,
      writeY: raster.y - expanded.y,
      fullRect,
      visibleRect,
    };
  }
  const dstX = Math.max(0, Math.round(view.backingViewportRect.x));
  const dstY = Math.max(0, Math.round(view.backingViewportRect.y));
  const dstWidth = Math.max(0, Math.round(view.backingViewportRect.width));
  const dstHeight = Math.max(0, Math.round(view.backingViewportRect.height));
  const { width, height } = clampCanvasDimensions(dstWidth, dstHeight, limits);
  return {
    mode: RasterUploadMode.Viewport,
    dstX,
    dstY,
    dstWidth,
    dstHeight,
    width,
    height,
    tileBounds,
  };
}

/**
 * Fast view-only pan/resize check for cropped uploads. Returns true while the
 * currently visible document area stays inside the already-uploaded cropped rect.
 */
export function isCroppedUploadCovered(
  cached: Rect,
  full: Rect,
  document: { readonly width: number; readonly height: number },
  view: Pick<RasterUploadViewport, "viewport" | "origin" | "zoom" | "backingScale" | "tiledMode">,
): boolean {
  const { visibleRect } = visibleRequiredRect(full, document, view);
  if (!visibleRect) return true;
  if (cached.width <= 0 || cached.height <= 0) return false;
  return (
    cached.x <= visibleRect.x &&
    cached.y <= visibleRect.y &&
    cached.x + cached.width >= visibleRect.x + visibleRect.width &&
    cached.y + cached.height >= visibleRect.y + visibleRect.height
  );
}

/**
 * Copy the cropped region of `source` into `target`. When `dirtyBounds` (in
 * source pixel coordinates) is given, only its intersection with the cropped
 * canvas is copied. Returns the target dirty rect for `putImageData`, or null
 * when the dirty rect lies outside the cropped upload.
 */
export function copyCroppedRasterPixels(
  source: RasterPixelSource,
  target: RasterPixelSource,
  upload: Pick<RasterUploadRect, "width" | "height" | "writeX" | "writeY">,
  dirtyBounds?: Rect | null,
): Rect | null {
  if (upload.width <= 0 || upload.height <= 0) return null;
  const visibleSrcLeft = Math.max(0, -upload.writeX);
  const visibleSrcTop = Math.max(0, -upload.writeY);
  const visibleSrcRight = Math.min(source.width, upload.width - upload.writeX);
  const visibleSrcBottom = Math.min(source.height, upload.height - upload.writeY);
  if (dirtyBounds) {
    const srcLeft = Math.max(visibleSrcLeft, Math.floor(dirtyBounds.x));
    const srcTop = Math.max(visibleSrcTop, Math.floor(dirtyBounds.y));
    const srcRight = Math.min(visibleSrcRight, Math.ceil(dirtyBounds.x + dirtyBounds.width));
    const srcBottom = Math.min(visibleSrcBottom, Math.ceil(dirtyBounds.y + dirtyBounds.height));
    if (srcRight <= srcLeft || srcBottom <= srcTop) return null;
    const copyWidth = srcRight - srcLeft;
    const copyHeight = srcBottom - srcTop;
    const dstLeft = srcLeft + upload.writeX;
    const dstTop = srcTop + upload.writeY;
    copyPixelRect(source, target, srcLeft, srcTop, dstLeft, dstTop, copyWidth, copyHeight);
    return { x: dstLeft, y: dstTop, width: copyWidth, height: copyHeight };
  }
  const hasVisiblePixels = visibleSrcRight > visibleSrcLeft && visibleSrcBottom > visibleSrcTop;
  const coversTarget =
    hasVisiblePixels &&
    visibleSrcLeft + upload.writeX === 0 &&
    visibleSrcTop + upload.writeY === 0 &&
    visibleSrcRight - visibleSrcLeft === upload.width &&
    visibleSrcBottom - visibleSrcTop === upload.height;
  if (!coversTarget) target.data.fill(0);
  if (hasVisiblePixels) {
    copyPixelRect(
      source,
      target,
      visibleSrcLeft,
      visibleSrcTop,
      visibleSrcLeft + upload.writeX,
      visibleSrcTop + upload.writeY,
      visibleSrcRight - visibleSrcLeft,
      visibleSrcBottom - visibleSrcTop,
    );
  }
  return { x: 0, y: 0, width: upload.width, height: upload.height };
}

/** Precompute nearest-neighbor source coordinate maps for viewport-resolution uploads. */
export function buildViewportSampleMaps(
  plan: ViewportRasterUploadPlan,
  raster: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
  document: { readonly width: number; readonly height: number },
  view: Pick<RasterUploadViewport, "origin" | "zoom" | "backingScale" | "tiledMode">,
): ViewportSampleMaps {
  const colMap = new Int32Array(plan.width);
  const rowMap = new Int32Array(plan.height);
  const scale = view.zoom * view.backingScale;
  const originBackingX = view.origin.x * view.backingScale;
  const originBackingY = view.origin.y * view.backingScale;
  const tileX = !!(view.tiledMode & 1);
  const tileY = !!(view.tiledMode & 2);
  const tileRight = plan.tileBounds.x + plan.tileBounds.width;
  const tileBottom = plan.tileBounds.y + plan.tileBounds.height;

  for (let ox = 0; ox < plan.width; ox++) {
    const bx = plan.dstX + ((ox + 0.5) * plan.dstWidth) / plan.width;
    const tileDocX = Math.floor((bx - originBackingX) / scale);
    if (tileDocX < plan.tileBounds.x || tileDocX >= tileRight) {
      colMap[ox] = -1;
      continue;
    }
    const docX = tileX ? ((tileDocX % document.width) + document.width) % document.width : tileDocX;
    if (docX < 0 || docX >= document.width) {
      colMap[ox] = -1;
      continue;
    }
    const srcX = docX - raster.x;
    colMap[ox] = srcX >= 0 && srcX < raster.width ? srcX : -1;
  }

  for (let oy = 0; oy < plan.height; oy++) {
    const by = plan.dstY + ((oy + 0.5) * plan.dstHeight) / plan.height;
    const tileDocY = Math.floor((by - originBackingY) / scale);
    if (tileDocY < plan.tileBounds.y || tileDocY >= tileBottom) {
      rowMap[oy] = -1;
      continue;
    }
    const docY = tileY
      ? ((tileDocY % document.height) + document.height) % document.height
      : tileDocY;
    if (docY < 0 || docY >= document.height) {
      rowMap[oy] = -1;
      continue;
    }
    const srcY = docY - raster.y;
    rowMap[oy] = srcY >= 0 && srcY < raster.height ? srcY : -1;
  }

  return { colMap, rowMap };
}

/**
 * Nearest-neighbor sample `source` into `target` using precomputed viewport maps.
 * When `dirtyBounds` (in source pixel coordinates) is provided, only target
 * pixels spanning `dirtyBounds` are resampled. Returns the target dirty rect for
 * `putImageData`, or null when no sampled pixel references `dirtyBounds`.
 */
export function sampleViewportRasterPixels(
  source: RasterPixelSource,
  target: RasterPixelSource,
  maps: ViewportSampleMaps,
  dirtyBounds?: Rect | null,
): Rect | null {
  const { colMap, rowMap } = maps;
  const width = target.width;
  const height = target.height;
  if (width <= 0 || height <= 0) return null;

  let minX = 0;
  let maxX = width - 1;
  let minY = 0;
  let maxY = height - 1;
  if (dirtyBounds) {
    const dirtyLeft = Math.floor(dirtyBounds.x);
    const dirtyTop = Math.floor(dirtyBounds.y);
    const dirtyRight = Math.ceil(dirtyBounds.x + dirtyBounds.width);
    const dirtyBottom = Math.ceil(dirtyBounds.y + dirtyBounds.height);
    minX = width;
    maxX = -1;
    for (let ox = 0; ox < width; ox++) {
      const sx = colMap[ox];
      if (sx >= dirtyLeft && sx < dirtyRight) {
        if (ox < minX) minX = ox;
        if (ox > maxX) maxX = ox;
      }
    }
    minY = height;
    maxY = -1;
    for (let oy = 0; oy < height; oy++) {
      const sy = rowMap[oy];
      if (sy >= dirtyTop && sy < dirtyBottom) {
        if (oy < minY) minY = oy;
        if (oy > maxY) maxY = oy;
      }
    }
    if (minX > maxX || minY > maxY) return null;
  }

  const srcData = source.data;
  const dstData = target.data;
  const aligned32 = (srcData.byteOffset & 3) === 0 && (dstData.byteOffset & 3) === 0;
  if (aligned32) {
    const src32 = new Uint32Array(srcData.buffer, srcData.byteOffset, source.width * source.height);
    const dst32 = new Uint32Array(dstData.buffer, dstData.byteOffset, width * height);
    for (let oy = minY; oy <= maxY; oy++) {
      const sy = rowMap[oy];
      const dstRow = oy * width;
      if (sy < 0) {
        dst32.fill(0, dstRow + minX, dstRow + maxX + 1);
        continue;
      }
      const srcRow = sy * source.width;
      for (let ox = minX; ox <= maxX; ox++) {
        const sx = colMap[ox];
        dst32[dstRow + ox] = sx < 0 ? 0 : src32[srcRow + sx];
      }
    }
  } else {
    for (let oy = minY; oy <= maxY; oy++) {
      const sy = rowMap[oy];
      const dstRow = oy * width;
      if (sy < 0) {
        dstData.fill(0, (dstRow + minX) * RGBA_CHANNELS, (dstRow + maxX + 1) * RGBA_CHANNELS);
        continue;
      }
      const srcRow = sy * source.width;
      for (let ox = minX; ox <= maxX; ox++) {
        const sx = colMap[ox];
        const dstAt = (dstRow + ox) * RGBA_CHANNELS;
        if (sx < 0) {
          dstData[dstAt] = 0;
          dstData[dstAt + 1] = 0;
          dstData[dstAt + 2] = 0;
          dstData[dstAt + 3] = 0;
        } else {
          const srcAt = (srcRow + sx) * RGBA_CHANNELS;
          dstData[dstAt] = srcData[srcAt];
          dstData[dstAt + 1] = srcData[srcAt + 1];
          dstData[dstAt + 2] = srcData[srcAt + 2];
          dstData[dstAt + 3] = srcData[srcAt + 3];
        }
      }
    }
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}
