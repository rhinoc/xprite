import {
  centerUiPixel,
  measureUiText,
  paintUiPart,
  paintUiText,
  uiFontHeight,
  type UiAssets,
} from "@xprite/ui/assets";

export interface TimelineFrameArtwork {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  selected: boolean;
  hovered?: boolean;
}

/** The editor's original frame header painter, shared with read-only timelines. */
export function paintTimelineFrameArtwork(
  ctx: CanvasRenderingContext2D,
  assets: UiAssets,
  { x, y, width, height, label, selected, hovered }: TimelineFrameArtwork,
) {
  paintUiPart(
    ctx,
    assets,
    hovered
      ? selected
        ? "timeline_active_hover"
        : "timeline_hover"
      : selected
        ? "timeline_active"
        : "timeline_normal",
    x,
    y,
    width,
    height,
  );
  paintUiText(
    ctx,
    assets,
    label,
    centerUiPixel(x, width, measureUiText(label, "mini", 2, assets.style.typography)),
    centerUiPixel(y, height, uiFontHeight("mini", 2, assets.style.typography)),
    {
      font: "mini",
      color: selected
        ? assets.style.colors.timeline_active_text
        : assets.style.colors.timeline_normal_text,
    },
  );
}
