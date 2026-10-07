import { UINT8_MAX } from "@xprite/editor-core/base";
import type { AsepriteTag } from "@xprite/editor-core/import-export";
import { measureUiText, paintUiPart, paintUiText, type UiAssets } from "@xprite/ui/assets";

export interface TimelineTagArtwork {
  tag: AsepriteTag;
  x: number;
  y: number;
  width: number;
}

/** Extracted from the editor timeline's tag painter, retaining its source geometry. */
export function paintTimelineTagArtwork(
  ctx: CanvasRenderingContext2D,
  assets: UiAssets,
  { tag, x, y, width }: TimelineTagArtwork,
) {
  const color = `rgba(${tag.color[0]}, ${tag.color[1]}, ${tag.color[2]}, ${(tag.color[3] ?? UINT8_MAX) / UINT8_MAX})`;
  const ink =
    tag.color[0] * 299 + tag.color[1] * 587 + tag.color[2] * 114 > 150000 ? "#000000" : "#ffffff";
  paintUiPart(ctx, assets, "timeline_loop_range", x, y + 30, Math.max(24, width), 32, { color });
  ctx.fillStyle = color;
  ctx.fillRect(x + 6, y + 12, measureUiText(tag.name) + 8, 18);
  paintUiText(ctx, assets, tag.name, x + 10, y + 16, { color: ink });
}
