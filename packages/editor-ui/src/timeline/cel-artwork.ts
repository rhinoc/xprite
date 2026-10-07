import type { TimelineCel } from "@xprite/editor-core/timeline";
import { paintUiPart, paintUiIcon, type UiAssets, type UiPartName } from "@xprite/ui/assets";

export const celIdentity = (cel: TimelineCel) => cel.tilemap ?? cel.asepriteSamples ?? cel.pixels;
export const celsShareImage = (a: TimelineCel | null, b: TimelineCel | null) =>
  !!a && !!b && celIdentity(a) === celIdentity(b);
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
export function paintTimelineCelArtwork(
  ctx: CanvasRenderingContext2D,
  assets: UiAssets,
  {
    cel,
    leftCel,
    rightCel,
    group,
    x,
    y,
    width,
    height,
    selected,
    active,
  }: {
    cel: TimelineCel | null;
    leftCel: TimelineCel | null;
    rightCel: TimelineCel | null;
    group: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    selected: boolean;
    active: boolean;
  },
) {
  const part = selected ? "timeline_clicked" : active ? "timeline_active" : "timeline_normal";
  paintUiPart(ctx, assets, part, x, y, width, height);
  const marker = timelinePartForCel(
    !!cel,
    celsShareImage(leftCel, cel),
    celsShareImage(rightCel, cel),
  );
  if (!group) {
    const surface = assets.style.parts[part].surface;
    ctx.save();
    if (surface) {
      const edge = surface.borderWidth;
      const [top, right, bottom, left] = surface.borderSides ?? [true, true, true, true];
      ctx.beginPath();
      ctx.rect(
        x + (left ? edge : 0),
        y + (top ? edge : 0),
        Math.max(0, width - (left ? edge : 0) - (right ? edge : 0)),
        Math.max(0, height - (top ? edge : 0) - (bottom ? edge : 0)),
      );
      ctx.clip();
    }
    paintUiPart(
      ctx,
      assets,
      active && !surface ? (marker.replace(/_normal$/, "_active") as UiPartName) : marker,
      x,
      y,
      width,
      height,
    );
    ctx.restore();
  }
  if (cel?.zIndex) paintUiIcon(ctx, assets, "timeline_zindex", x + 12, y + 10);
}
