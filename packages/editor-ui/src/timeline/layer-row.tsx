import { useState } from "react";

import { paintLayerRowArtwork } from "$/timeline/layer-artwork";
import { LayerFlagControls } from "$/timeline/layer-flag-controls";
import { LAYER_COLLAPSED, type SpriteTimeline } from "@xprite/editor-core/timeline";
import { CanvasSurface, useUi } from "@xprite/ui";
import { useUiAssets } from "@xprite/ui/assets";

import styles from "$/timeline/timeline.module.css";

const ROW_HEIGHT = 24;
const FLAG_CELL_WIDTH = 24;
const LAYER_FLAG_COUNT = 1;
const GROUP_FLAG_COUNT = 2;

export interface ReadOnlyLayerRowProps {
  timeline: SpriteTimeline;
  index: number;
  width: number;
  height?: number;
  selected?: boolean;
  visibilityDisabled?: boolean;
  onSelect?: (index: number) => void;
  onVisible?: (index: number) => void;
  onCollapsed?: (index: number) => void;
}

/** Same artwork and flag hit controls as the editor; mutation callbacks are absent. */
export function ReadOnlyLayerRow({
  timeline,
  index,
  width,
  height = ROW_HEIGHT,
  selected = false,
  visibilityDisabled = false,
  onSelect,
  onVisible,
  onCollapsed,
}: ReadOnlyLayerRowProps) {
  const assets = useUiAssets();
  const { translateSource } = useUi();
  const [hovered, setHovered] = useState(false);
  const layer = timeline.layers[index];
  const group = layer.kind === "group";
  const label = (text: string) => translateSource(text).replace("{name}", layer.name);
  return (
    <div
      className={styles.layerRow}
      style={{ width, height }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <CanvasSurface
        bounds={{ x: 0, y: 0, width, height }}
        dependencies={[assets, timeline, index, selected, hovered]}
        paint={(ctx) => {
          if (assets)
            paintLayerRowArtwork(ctx, assets, {
              timeline,
              index,
              x: 0,
              y: 0,
              width,
              height,
              selected,
              hovered,
              readOnlyFlags: [visibilityDisabled, true, !group],
              compactFlags: true,
            });
        }}
      />
      <LayerFlagControls
        height={height}
        cellWidth={FLAG_CELL_WIDTH}
        controls={[
          {
            kind: "visible",
            label: label(layer.visible ? "Hide layer {name}" : "Show layer {name}"),
            pressed: layer.visible,
            dragValue: !layer.visible,
            disabled: visibilityDisabled || !onVisible,
            onActivate: () => onVisible?.(index),
            onDragChange: () => {},
          },
          ...(group
            ? [
                {
                  kind: "collapsed",
                  label: label(
                    layer.flags & LAYER_COLLAPSED ? "Expand group {name}" : "Collapse group {name}",
                  ),
                  pressed: !(layer.flags & LAYER_COLLAPSED),
                  dragValue: false,
                  disabled: !onCollapsed,
                  onActivate: () => onCollapsed?.(index),
                  onDragChange: () => {},
                },
              ]
            : []),
        ]}
      />
      <button
        className={styles.layerNameHit}
        style={{ left: (group ? GROUP_FLAG_COUNT : LAYER_FLAG_COUNT) * FLAG_CELL_WIDTH }}
        aria-label={layer.name}
        aria-pressed={selected}
        type="button"
        title={layer.name}
        onClick={() => onSelect?.(index)}
        disabled={!onSelect}
      />
    </div>
  );
}
