import type { MutableRefObject } from "react";

import { tUi, useUiLanguage } from "$/i18n";
import type { SpriteTimeline } from "$/managers/timeline/timeline-presentation";
import { LayerFlagControls, type LayerFlagDragState } from "@xprite/editor-ui/timeline";
import { UI_SCALE_X as sx, UI_SCALE_Y as sy } from "@xprite/ui/canvas";

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
