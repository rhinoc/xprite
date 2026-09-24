import type { MutableRefObject } from "react";
import type { CSSProperties } from "react";

import { cn, stylusPointerInputProps } from "@xprite/ui/utils";

import styles from "$/components/timeline/layer-flag-controls/layer-flag-controls.module.css";

export interface LayerFlagDragState<Kind extends string = string> {
  kind: Kind;
  value: boolean;
}

interface LayerFlagDefinition<Kind extends string = string> {
  kind: Kind;
  label: string;
  pressed: boolean;
  /** State to apply to matching controls while dragging over them. */
  dragValue: boolean;
  onActivate: () => void;
  onDragChange: (value: boolean) => void;
}

export interface LayerFlagControlsProps<Kind extends string = string> {
  controls: readonly [
    LayerFlagDefinition<Kind>,
    LayerFlagDefinition<Kind>,
    LayerFlagDefinition<Kind>,
  ];
  cellWidth?: number;
  height?: number;
  disabled?: boolean;
  onSolo?: () => void;
  dragRef?: MutableRefObject<LayerFlagDragState<Kind> | null>;
  className?: string;
}

/** Three themed layer action hit areas with optional paint-drag and solo behavior. */
export function LayerFlagControls<Kind extends string = string>({
  controls,
  cellWidth = 24,
  height = 24,
  disabled,
  onSolo,
  dragRef,
  className,
}: LayerFlagControlsProps<Kind>) {
  return (
    <>
      {controls.map((control, column) => (
        <button
          key={control.kind}
          {...stylusPointerInputProps(!disabled)}
          type="button"
          className={cn(styles.control, className)}
          aria-label={control.label}
          aria-pressed={control.pressed}
          disabled={disabled}
          style={
            {
              "--ui-layer-flag-column": column,
              "--ui-layer-flag-cell-width": `${cellWidth}px`,
              "--ui-layer-flag-height": `${height}px`,
            } as CSSProperties
          }
          onPointerDown={(event) => {
            event.stopPropagation();
            if (event.button !== 0) return;
            event.preventDefault();
            if (column === 0 && event.altKey && onSolo) {
              onSolo();
              return;
            }
            if (dragRef) dragRef.current = { kind: control.kind, value: control.dragValue };
            control.onActivate();
          }}
          onPointerEnter={(event) => {
            const drag = dragRef?.current;
            if (event.buttons !== 1 || !drag || drag.kind !== control.kind) return;
            control.onDragChange(drag.value);
          }}
          onClick={(event) => {
            event.stopPropagation();
            if (event.detail === 0) control.onActivate();
          }}
        />
      ))}
    </>
  );
}
