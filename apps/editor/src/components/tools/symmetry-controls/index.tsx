import { tUi } from "$/i18n";
import { Button, Menu, Tooltip } from "@xprite/ui";
import type { UiPartName } from "@xprite/ui/assets";

import styles from "$/components/tools/symmetry-controls/symmetry-controls.module.css";

interface SymmetryControlsBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export enum SymmetryControlMode {
  Horizontal = 1,
  Vertical = 2,
  DiagonalPositive = 4,
  DiagonalNegative = 8,
}

export interface SymmetryControlsProps {
  bounds: SymmetryControlsBounds;
  relativeTo?: { x: number; y: number };
  mode: number;
  onModeChange: (mode: number) => void;
  onResetCenter: () => void;
  onResetViewCenter: () => void;
}

const BUTTON_STEP = 28;
const BUTTON_WIDTH = 30;
const SYMMETRY_OPTIONS: readonly {
  mode: SymmetryControlMode;
  label: string;
  icon: UiPartName;
}[] = [
  {
    mode: SymmetryControlMode.Horizontal,
    label: "Toggle Horizontal Symmetry",
    icon: "horizontal_symmetry",
  },
  {
    mode: SymmetryControlMode.Vertical,
    label: "Toggle Vertical Symmetry",
    icon: "vertical_symmetry",
  },
  {
    mode: SymmetryControlMode.DiagonalPositive,
    label: "Toggle 45° Symmetry",
    icon: "right_diagonal_symmetry",
  },
  {
    mode: SymmetryControlMode.DiagonalNegative,
    label: "Toggle -45° Symmetry",
    icon: "left_diagonal_symmetry",
  },
];

/** Aseprite button-set controls for toggling canvas symmetry and resetting its axes. */
export function SymmetryControls({
  bounds,
  relativeTo,
  mode,
  onModeChange,
  onResetCenter,
  onResetViewCenter,
}: SymmetryControlsProps) {
  return (
    <div className={styles.controls} role="group" aria-label={tUi("ui.symmetry.controls")}>
      {SYMMETRY_OPTIONS.map((item, index) => (
        <Tooltip key={item.mode} text={item.label} placement="bottom">
          <Button
            className={styles.symmetryButton}
            aria-label={item.label}
            aria-pressed={!!(mode & item.mode)}
            selected={!!(mode & item.mode)}
            icon={item.icon}
            iconOffset={{ x: 0, y: 0 }}
            bounds={{
              x: bounds.x + index * BUTTON_STEP,
              y: bounds.y,
              width: BUTTON_WIDTH,
              height: bounds.height,
            }}
            relativeTo={relativeTo}
            part="buttonset_item_normal"
            hotPart="buttonset_item_hot"
            selectedPart="buttonset_item_hot"
            pushedPart="buttonset_item_pushed"
            onPointerDown={(event) => {
              if (event.button === 0) onModeChange(mode ^ item.mode);
            }}
            onClick={(event) => {
              if (event.detail === 0) onModeChange(mode ^ item.mode);
            }}
          />
        </Tooltip>
      ))}
      <Menu
        label="Symmetry Options"
        items={[
          { label: "Reset Symmetry to Center", onSelect: onResetCenter },
          { label: "Reset Symmetry to View Center", onSelect: onResetViewCenter },
        ]}
        renderTrigger={(props) => (
          <Tooltip text="Symmetry Options" placement="bottom" disabled={!!props["aria-expanded"]}>
            <Button
              {...props}
              className={styles.symmetryButton}
              aria-label="Symmetry Options"
              text="..."
              textOffset={{ x: 2, y: 0 }}
              bounds={{
                x: bounds.x + SYMMETRY_OPTIONS.length * BUTTON_STEP,
                y: bounds.y,
                width: BUTTON_WIDTH,
                height: bounds.height,
              }}
              relativeTo={relativeTo}
              part="buttonset_item_normal"
              hotPart="buttonset_item_hot"
              pushedPart="buttonset_item_pushed"
            />
          </Tooltip>
        )}
      />
    </div>
  );
}
