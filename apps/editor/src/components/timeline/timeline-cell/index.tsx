import { convertPixelsToSrgb } from "$/managers/timeline/timeline-presentation";
import type { PixelBuffer } from "$/managers/timeline/timeline-presentation";
import type { AsepriteColorProfile } from "$/managers/timeline/timeline-presentation";
import type { TimelineCel } from "$/managers/timeline/timeline-presentation";
import { type UiPartName } from "@xprite/ui/assets";
import { UI_SCALE_X as sx, UI_SCALE_Y as sy } from "@xprite/ui/canvas";
import { stylusPointerInputProps } from "@xprite/ui/utils";

export const celIdentity = (cel: TimelineCel) => cel.tilemap ?? cel.asepriteSamples ?? cel.pixels;
export const celsShareImage = (a: TimelineCel | null, b: TimelineCel | null) =>
  !!a && !!b && celIdentity(a) === celIdentity(b);
const thumbnailCache = new WeakMap<PixelBuffer, WeakMap<object, Map<string, HTMLCanvasElement>>>(),
  noThumbnailProfile = {};

export function timelineCelThumbnail(
  cel: TimelineCel,
  profile: AsepriteColorProfile | undefined,
  fitWidth: number,
  fitHeight: number,
  scaleUpToFit: boolean,
): HTMLCanvasElement | null {
  const source = cel.pixels;
  if (source.width < 1 || source.height < 1 || fitWidth < 1 || fitHeight < 1) return null;
  const scale =
    scaleUpToFit || source.width > fitWidth || source.height > fitHeight
      ? Math.min(fitWidth / source.width, fitHeight / source.height)
      : 1;
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
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(source.height - 1, Math.floor(((y + 0.5) * source.height) / height));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(source.width - 1, Math.floor(((x + 0.5) * source.width) / width)),
        from = (sourceY * source.width + sourceX) * 4,
        to = (y * width + x) * 4;
      image.data[to] = displayed.data[from];
      image.data[to + 1] = displayed.data[from + 1];
      image.data[to + 2] = displayed.data[from + 2];
      image.data[to + 3] = displayed.data[from + 3];
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
) {
  const fitWidth = Math.max(1, width - 4),
    fitHeight = Math.max(1, height - 4),
    tile = Math.max(4, Math.min(16, Math.floor(fitWidth / 8)));
  paintThumbnailChecker(ctx, x + 2, y + 2, fitWidth, fitHeight, tile);
  const image = timelineCelThumbnail(cel, profile, fitWidth, fitHeight, scaleUpToFit);
  if (!image) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    image,
    x + 2 + Math.floor((fitWidth - image.width) / 2),
    y + 2 + Math.floor((fitHeight - image.height) / 2),
  );
}

export function timelinePartForCel(
  hasCel: boolean,
  fromLeft: boolean,
  fromRight: boolean,
): UiPartName {
  if (!hasCel) return "timeline_empty_frame_normal";
  if (fromLeft && fromRight) return "timeline_from_both_normal";
  if (fromLeft) return "timeline_from_left_normal";
  if (fromRight) return "timeline_from_right_normal";
  return "timeline_keyframe_normal";
}
export function timelineFrameLabel(index: number, firstFrame = 1) {
  const frame = firstFrame + index;
  const suffix = frame % 100;
  const text = String(suffix);
  return frame >= 100 && suffix < 10 ? text.padStart(2, "0") : text;
}

export function paintThumbnailChecker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  tile: number,
) {
  for (let row = 0; row < height; row += tile)
    for (let col = 0; col < width; col += tile) {
      ctx.fillStyle = (Math.floor(row / tile) + Math.floor(col / tile)) & 1 ? "#808080" : "#c0c0c0";
      ctx.fillRect(x + col, y + row, Math.min(tile, width - col), Math.min(tile, height - row));
    }
}
export function TimelineCellButton({
  part: _part,
  overlayPart: _overlayPart,
  left,
  top,
  width = 24,
  height = 24,
  text: _text,
  textColor,
  label,
  selected = false,
  onClick,
  onDoubleClick,
  className = "",
  onHover,
  onLeave,
  frameIndex,
  layerIndex,
}: {
  part: UiPartName;
  overlayPart?: UiPartName;
  left: number;
  top: number;
  width?: number;
  height?: number;
  text?: string;
  textColor?: string;
  label: string;
  selected?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  className?: string;
  onHover?: () => void;
  onLeave?: () => void;
  frameIndex?: number;
  layerIndex?: number;
}) {
  return (
    <button
      type="button"
      {...stylusPointerInputProps()}
      className={`xse-timeline-cell ${className}`}
      data-timeline-kind={layerIndex === undefined ? "frames" : "cels"}
      data-frame={frameIndex}
      data-layer={layerIndex}
      aria-label={label}
      aria-pressed={selected}
      onPointerDown={(event) => {
        if (event.button === 0) onClick();
      }}
      onClick={(event) => {
        if (event.detail === 0) onClick();
      }}
      onDoubleClick={onDoubleClick}
      onPointerEnter={onHover}
      onPointerLeave={onLeave}
      style={{
        left: left * sx,
        top: top * sy,
        width: width * sx,
        height: height * sy,
        color: textColor,
      }}
    />
  );
}
