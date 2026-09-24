import { tUi, tUiSource } from "$/i18n";
import { ToolSelectionMode as SelectionMode } from "$/managers/tools/tool-options";
import { Button } from "@xprite/ui";
import type { UiPartName } from "@xprite/ui/assets";
import { cn } from "@xprite/ui/utils";

import styles from "$/components/tools/selection-mode-control/selection-mode-control.module.css";

const SELECTION_MODE_OPTIONS = [
  SelectionMode.Replace,
  SelectionMode.Add,
  SelectionMode.Subtract,
  SelectionMode.Intersect,
] as const;
const SELECTION_MODE_CELL_WIDTH = 28;
const SELECTION_MODE_BUTTON_WIDTH = 30;
const SELECTION_MODE_BUTTON_HEIGHT = 32;

export type SelectionOperation = SelectionMode;

export interface SelectionModeControlProps<Mode extends SelectionOperation = SelectionOperation> {
  mode: Mode;
  onChange: (mode: Mode) => void;
  x: number;
  y: number;
  relativeTo?: { x: number; y: number };
  width?: number;
  className?: string;
}

/** Aseprite-styled selection operation buttons. */
export function SelectionModeControl<Mode extends SelectionOperation = SelectionOperation>({
  mode,
  onChange,
  x,
  y,
  relativeTo,
  width,
  className,
}: SelectionModeControlProps<Mode>) {
  const cellWidth = width === undefined ? SELECTION_MODE_CELL_WIDTH : Math.floor(width / 8) * 2;
  return (
    <>
      {SELECTION_MODE_OPTIONS.map((option, index) => {
        const selected = mode === option;
        return (
          <Button
            key={option}
            className={cn(styles.option, className)}
            bounds={{
              x: x + index * cellWidth,
              y,
              width:
                width === undefined
                  ? SELECTION_MODE_BUTTON_WIDTH
                  : index === SELECTION_MODE_OPTIONS.length - 1
                    ? width - (SELECTION_MODE_OPTIONS.length - 1) * cellWidth
                    : cellWidth + 2,
              height: SELECTION_MODE_BUTTON_HEIGHT,
            }}
            relativeTo={relativeTo}
            icon={`selection_${option}` as UiPartName}
            selected={selected}
            part={selected ? "buttonset_item_hot" : "buttonset_item_normal"}
            aria-label={tUi("ui.selection.operation", {
              operation: tUiSource(option[0].toUpperCase() + option.slice(1)),
            })}
            onClick={() => onChange(option as Mode)}
          />
        );
      })}
    </>
  );
}
