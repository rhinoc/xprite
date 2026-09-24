import { useState, type CSSProperties } from "react";

import { tUi, tUiSource } from "$/i18n";
import { Button } from "@xprite/ui";
import { useUi } from "@xprite/ui";
import { Tooltip } from "@xprite/ui";
import { UiIcon } from "@xprite/ui/assets";

import styles from "$/components/palette/palette-warning/palette-warning.module.css";

interface PaletteWarningBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export enum PaletteWarningTarget {
  Foreground = "foreground",
  Background = "background",
}

export interface PaletteWarningProps {
  bounds: PaletteWarningBounds;
  relativeTo?: { x: number; y: number };
  target: PaletteWarningTarget;
  disabled?: boolean;
  onClick: () => void;
}

type PaletteWarningStyle = CSSProperties & {
  "--ui-palette-warning-workspace": string;
  "--ui-palette-warning-hot": string;
};

/** Aseprite palette warning icon and its accessible hit target. */
export function PaletteWarning({
  bounds,
  relativeTo = { x: 0, y: 0 },
  target,
  disabled = false,
  onClick,
}: PaletteWarningProps) {
  const { style: uiStyle } = useUi();
  const [hot, setHot] = useState(false);
  const label = tUi("ui.add.color.to.the.palette", { value1: tUiSource(target) });
  const style: PaletteWarningStyle = {
    "--ui-palette-warning-workspace": uiStyle.colors.workspace,
    "--ui-palette-warning-hot": uiStyle.colors.hot_face,
  };
  return (
    <Tooltip text={label} placement="left">
      <Button
        className={styles.warningButton}
        style={style}
        bounds={bounds}
        relativeTo={relativeTo}
        paintArtwork={false}
        disabled={disabled}
        aria-label={label}
        onClick={onClick}
        onPointerEnter={() => setHot(true)}
        onPointerLeave={() => setHot(false)}
        data-hot={hot && !disabled ? "true" : undefined}
      >
        <span className={styles.warningFace}>
          <UiIcon part="warning_box" x={4} y={4} scale={2} />
        </span>
      </Button>
    </Tooltip>
  );
}
