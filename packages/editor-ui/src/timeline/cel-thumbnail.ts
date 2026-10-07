import type { PixelBuffer } from "@xprite/editor-core/base";
import { convertPixelsToSrgb } from "@xprite/editor-core/color";
import type { AsepriteColorProfile } from "@xprite/editor-core/import-export";
import type { TimelineCel } from "@xprite/editor-core/timeline";
import type { SurfaceChecker } from "@xprite/ui";

const thumbnailCache = new WeakMap<PixelBuffer, WeakMap<object, Map<string, HTMLCanvasElement>>>(),
  noThumbnailProfile = {};
const DEFAULT_THUMBNAIL_INSET = 2;

export interface TimelineThumbnailAppearance {
  checker?: SurfaceChecker;
  inset?: number | readonly [number, number, number, number];
}

export function timelineCelThumbnail(
  cel: TimelineCel,
  profile: AsepriteColorProfile | undefined,
  fitWidth: number,
  fitHeight: number,
  scaleUpToFit: boolean,
  integerScale = false,
): HTMLCanvasElement | null {
  const source = cel.pixels;
  if (source.width < 1 || source.height < 1 || fitWidth < 1 || fitHeight < 1) return null;
  const fitScale =
    scaleUpToFit || source.width > fitWidth || source.height > fitHeight
      ? Math.min(fitWidth / source.width, fitHeight / source.height)
      : 1;
  const scale = integerScale && fitScale >= 1 ? Math.floor(fitScale) : fitScale;
  const width = Math.max(1, Math.min(fitWidth, Math.round(source.width * scale))),
    height = Math.max(1, Math.min(fitHeight, Math.round(source.height * scale)));
  const profileKey = (
    profile && typeof profile === "object" ? profile : noThumbnailProfile
  ) as object;
  let byProfile = thumbnailCache.get(source);
  if (!byProfile) {
    byProfile = new WeakMap();
    thumbnailCache.set(source, byProfile);
  }
  let bySize = byProfile.get(profileKey);
  if (!bySize) {
    bySize = new Map();
    byProfile.set(profileKey, bySize);
  }
  const key = `${width}x${height}:${fitWidth}x${fitHeight}:${scaleUpToFit}`;
  const cached = bySize.get(key);
  if (cached) return cached;
  const displayed = convertPixelsToSrgb(source, profile),
    canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(width, height);
  const displayedData = displayed.data;
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(source.height - 1, Math.floor(((y + 0.5) * source.height) / height));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(source.width - 1, Math.floor(((x + 0.5) * source.width) / width)),
        from = (sourceY * source.width + sourceX) * 4,
        to = (y * width + x) * 4;
      image.data[to] = displayedData[from];
      image.data[to + 1] = displayedData[from + 1];
      image.data[to + 2] = displayedData[from + 2];
      image.data[to + 3] = displayedData[from + 3];
    }
  }
  context.putImageData(image, 0, 0);
  bySize.set(key, canvas);
  return canvas;
}
export function paintTimelineThumbnail(
  ctx: CanvasRenderingContext2D,
  cel: TimelineCel,
  profile: AsepriteColorProfile | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  scaleUpToFit: boolean,
  integerScale = false,
  appearance: TimelineThumbnailAppearance = {},
) {
  const inset = appearance.inset ?? DEFAULT_THUMBNAIL_INSET;
  const [top, right, bottom, left] =
    typeof inset === "number" ? [inset, inset, inset, inset] : inset;
  const fitWidth = Math.max(1, width - left - right),
    fitHeight = Math.max(1, height - top - bottom),
    tile = Math.max(4, Math.min(16, Math.floor(fitWidth / 8)));
  paintThumbnailChecker(ctx, x + left, y + top, fitWidth, fitHeight, tile, appearance.checker);
  const image = timelineCelThumbnail(cel, profile, fitWidth, fitHeight, scaleUpToFit, integerScale);
  if (!image) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    image,
    x + left + Math.floor((fitWidth - image.width) / 2),
    y + top + Math.floor((fitHeight - image.height) / 2),
  );
}

export function paintThumbnailChecker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  tile: number,
  checker?: SurfaceChecker,
) {
  const light = checker ? `rgb(${checker.light.join(",")})` : "#c0c0c0";
  const dark = checker ? `rgb(${checker.dark.join(",")})` : "#808080";
  for (let row = 0; row < height; row += tile)
    for (let col = 0; col < width; col += tile) {
      ctx.fillStyle = (Math.floor(row / tile) + Math.floor(col / tile)) & 1 ? dark : light;
      ctx.fillRect(x + col, y + row, Math.min(tile, width - col), Math.min(tile, height - row));
    }
}
