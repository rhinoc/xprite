import { UINT8_MAX } from "@xprite/editor-core/base";
import {
  layerAncestors,
  timelineLayerDepth,
  visibleTimelineLayers,
  type SpriteTimeline,
} from "@xprite/editor-core/timeline";
import {
  paintUiIcon,
  paintUiPart,
  paintUiText,
  measureUiText,
  uiFontHeight,
  type UiAssets,
  type UiPartName,
} from "@xprite/ui/assets";

/** Aseprite Timeline::drawLayer adapter: source hierarchy, order and flags in one primitive. */
export function asepriteLayerRows(timeline: SpriteTimeline) {
  return visibleTimelineLayers(timeline).map((index, row) => ({
    layer: timeline.layers[index],
    index,
    row,
    depth: timelineLayerDepth(timeline, index),
  }));
}
export interface LayerRowPaint {
  timeline: SpriteTimeline;
  index: number;
  x: number;
  y: number;
  width: number;
  height?: number;
  selected: boolean;
  hovered?: boolean;
  readOnlyFlags?: readonly boolean[];
  compactFlags?: boolean;
}
export function paintLayerRowArtwork(
  ctx: CanvasRenderingContext2D,
  assets: UiAssets,
  {
    timeline,
    index,
    x,
    y,
    width,
    height = 24,
    selected,
    hovered,
    readOnlyFlags,
    compactFlags = false,
  }: LayerRowPaint,
) {
  const layer = timeline.layers[index],
    parents = layerAncestors(timeline, index),
    depth = parents.length;
  const state = selected ? "active" : "normal",
    box = selected ? "timeline_active" : "timeline_normal";
  const icons = [
    `timeline_${layer.visible ? "open" : "closed"}_eye_${state}`,
    `timeline_${layer.locked ? "closed" : "open"}_padlock_${state}`,
    layer.kind === "group"
      ? `timeline_${layer.flags & 32 ? "closed" : "open"}_group_${state}`
      : `timeline_${layer.flags & 16 ? "continuous" : "discontinuous"}_${state}`,
  ] as const;
  const iconY = y + Math.floor((height - 24) / 2);
  const columns = compactFlags ? (layer.kind === "group" ? [0, 2] : [0]) : [0, 1, 2];
  const flagsWidth = columns.length * 24;
  for (const [column, i] of columns.entries()) {
    paintUiPart(ctx, assets, box, x + column * 24, y, 24, height);
    const disabled =
      !!readOnlyFlags?.[i] ||
      (i === 0 && parents.some((p) => !p.visible)) ||
      (i === 1 && parents.some((p) => p.locked));
    paintUiIcon(
      ctx,
      assets,
      (disabled ? icons[i].replace(/_active$/, "_normal") : icons[i]) as UiPartName,
      x + column * 24,
      iconY,
      disabled ? { color: assets.style.colors.disabled } : {},
    );
  }
  const part = hovered ? (selected ? "timeline_active_hover" : "timeline_hover") : box;
  paintUiPart(ctx, assets, part, x + flagsWidth, y, width - flagsWidth, height);
  // Source indentation uses timelineBaseSize (12 Aseprite GUI pixels * GUI scale 2).
  const tx = x + flagsWidth + depth * 24;
  for (let level = 0; level < depth; level++) {
    const px = x + flagsWidth + level * 24;
    paintUiPart(ctx, assets, part, px, y, 24, height);
    const parent = parents[depth - level - 1];
    const color = (
      parent.userData === null ? undefined : (parent.userData ?? parent.source?.userData)
    )?.color;
    if (color?.[3]) {
      ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${color[3] / UINT8_MAX})`;
      ctx.fillRect(px + 2, y + 2, 20, height - 4);
    }
  }
  if (depth) paintUiPart(ctx, assets, part, tx, y, width - flagsWidth - depth * 24, height);
  const ownColor = (
    layer.userData === null ? undefined : (layer.userData ?? layer.source?.userData)
  )?.color;
  if (ownColor?.[3]) {
    ctx.fillStyle = `rgba(${ownColor[0]},${ownColor[1]},${ownColor[2]},${ownColor[3] / UINT8_MAX})`;
    ctx.fillRect(tx + 2, y + 2, width - flagsWidth - 2 - depth * 24, height - 4);
  }
  const color = selected
    ? assets.style.colors.timeline_active_text
    : assets.style.colors.timeline_normal_text;
  paintUiText(
    ctx,
    assets,
    layer.name,
    tx + 8,
    y + Math.floor((height - uiFontHeight("default", 2, assets.style.typography)) / 2),
    { color },
  );
  if (layer.flags & (8 | 64)) {
    ctx.fillStyle = color;
    ctx.fillRect(
      tx + 8,
      y + (layer.flags & 8 ? height - 4 : Math.floor(height / 2)),
      measureUiText(layer.name, "default", 2, assets.style.typography),
      2,
    );
  }
}
