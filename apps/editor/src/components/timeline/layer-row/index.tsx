import type { MutableRefObject } from "react";

import {
  LayerFlagControls,
  type LayerFlagDragState,
} from "$/components/timeline/layer-flag-controls";
import { tUi, useUiLanguage } from "$/i18n";
import {
  layerAncestors,
  timelineLayerDepth,
  visibleTimelineLayers,
  type SpriteTimeline,
} from "$/managers/timeline/timeline-presentation";
import { UINT8_MAX } from "$/managers/timeline/timeline-presentation";
import type { UiPartName } from "@xprite/ui/assets";
import {
  paintUiIcon,
  paintUiPart,
  paintUiText,
  measureUiText,
  type UiAssets,
} from "@xprite/ui/assets";
import { UI_SCALE_X as sx, UI_SCALE_Y as sy } from "@xprite/ui/canvas";

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
}
export function paintLayerRowArtwork(
  ctx: CanvasRenderingContext2D,
  assets: UiAssets,
  { timeline, index, x, y, width, height = 24, selected, hovered }: LayerRowPaint,
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
  for (let i = 0; i < 3; i++) {
    paintUiPart(ctx, assets, box, x + i * 24, y, 24, height);
    const disabled =
      (i === 0 && parents.some((p) => !p.visible)) || (i === 1 && parents.some((p) => p.locked));
    paintUiIcon(
      ctx,
      assets,
      (disabled ? icons[i].replace(/_active$/, "_normal") : icons[i]) as UiPartName,
      x + i * 24,
      iconY,
      disabled ? { color: assets.style.colors.disabled } : {},
    );
  }
  const part = hovered ? (selected ? "timeline_active_hover" : "timeline_hover") : box;
  paintUiPart(ctx, assets, part, x + 72, y, width - 72, height);
  // Source indentation uses timelineBaseSize (12 Aseprite GUI pixels * GUI scale 2).
  const tx = x + 72 + depth * 24;
  for (let level = 0; level < depth; level++) {
    const px = x + 72 + level * 24;
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
  if (depth) paintUiPart(ctx, assets, part, tx, y, width - 72 - depth * 24, height);
  const ownColor = (
    layer.userData === null ? undefined : (layer.userData ?? layer.source?.userData)
  )?.color;
  if (ownColor?.[3]) {
    ctx.fillStyle = `rgba(${ownColor[0]},${ownColor[1]},${ownColor[2]},${ownColor[3] / UINT8_MAX})`;
    ctx.fillRect(tx + 2, y + 2, width - 74 - depth * 24, height - 4);
  }
  const color = selected
    ? assets.style.colors.timeline_active_text
    : assets.style.colors.timeline_normal_text;
  paintUiText(ctx, assets, layer.name, tx + 8, y + Math.floor((height - 14) / 2), { color });
  if (layer.flags & (8 | 64)) {
    ctx.fillStyle = color;
    ctx.fillRect(
      tx + 8,
      y + (layer.flags & 8 ? height - 4 : Math.floor(height / 2)),
      measureUiText(layer.name),
      2,
    );
  }
}
export interface EditorLayerFlagControlsProps {
  timeline: SpriteTimeline;
  index: number;
  height?: number;
  onVisible: (value: boolean, index: number) => void;
  onLocked: (value: boolean, index: number) => void;
  onContinuous: (value: boolean, index: number) => void;
  onCollapsed: (value: boolean, index: number) => void;
  disabled?: boolean;
  onSolo?: (index: number) => void;
  dragRef?: MutableRefObject<LayerFlagDragState<
    "visible" | "locked" | "continuous" | "collapsed"
  > | null>;
}
/** Adapts timeline model state and localization to the reusable themed hit controls. */
export function EditorLayerFlagControls({
  timeline,
  index,
  height = 24,
  onVisible,
  onLocked,
  onContinuous,
  onCollapsed,
  disabled,
  onSolo,
  dragRef,
}: EditorLayerFlagControlsProps) {
  useUiLanguage();
  const layer = timeline.layers[index];
  const controls = [
    {
      kind: "visible" as const,
      label: tUi(layer.visible ? "ui.hide.layer.name" : "ui.show.layer.name", { name: layer.name }),
      pressed: layer.visible,
      dragValue: !layer.visible,
      onActivate: () => onVisible(!layer.visible, index),
      onDragChange: (value: boolean) => onVisible(value, index),
    },
    {
      kind: "locked" as const,
      label: tUi(layer.locked ? "ui.unlock.layer.name" : "ui.lock.layer.name", {
        name: layer.name,
      }),
      pressed: layer.locked,
      dragValue: !layer.locked,
      onActivate: () => onLocked(!layer.locked, index),
      onDragChange: (value: boolean) => onLocked(value, index),
    },
    layer.kind === "group"
      ? {
          kind: "collapsed" as const,
          label: tUi(layer.flags & 32 ? "ui.expand.group.name" : "ui.collapse.group.name", {
            name: layer.name,
          }),
          pressed: !(layer.flags & 32),
          dragValue: !(layer.flags & 32),
          onActivate: () => onCollapsed(!(layer.flags & 32), index),
          onDragChange: (value: boolean) => onCollapsed(value, index),
        }
      : {
          kind: "continuous" as const,
          label: tUi(
            layer.flags & 16
              ? "ui.disable.continuous.cels.for.layer.name"
              : "ui.enable.continuous.cels.for.layer.name",
            { name: layer.name },
          ),
          pressed: !!(layer.flags & 16),
          dragValue: !(layer.flags & 16),
          onActivate: () => onContinuous(!(layer.flags & 16), index),
          onDragChange: (value: boolean) => onContinuous(value, index),
        },
  ] as const;
  return (
    <LayerFlagControls
      controls={controls}
      cellWidth={24 * sx}
      height={height * sy}
      disabled={disabled}
      dragRef={dragRef}
      onSolo={onSolo ? () => onSolo(index) : undefined}
    />
  );
}
