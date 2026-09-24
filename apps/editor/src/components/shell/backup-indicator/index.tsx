import { useEffect, useState } from "react";

import { useUi } from "@xprite/ui";
import { UiIcon, centerUiPixel } from "@xprite/ui/assets";

import styles from "$/components/shell/backup-indicator/backup-indicator.module.css";

const BACKUP_ANIMATION_INTERVAL_MS = 100;
const ICON_SCALE = 2;
const INDICATOR_SIZE = 24;

export interface BackupIndicatorProps {
  active: boolean;
}

/** Aseprite save activity indicator. Activity is presentation state, not a saved-state assertion. */
export function BackupIndicator({ active }: BackupIndicatorProps) {
  const { style: uiStyle } = useUi();
  const [small, setSmall] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(
      () => setSmall((value) => !value),
      BACKUP_ANIMATION_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [active]);

  if (!active) return null;
  const name = small ? "icon_save_small" : "icon_save";
  const part = uiStyle.parts[name];
  const iconX = centerUiPixel(0, INDICATOR_SIZE, part.width * ICON_SCALE);
  const iconY = centerUiPixel(0, INDICATOR_SIZE, part.height * ICON_SCALE);
  return (
    <div
      aria-hidden="true"
      data-backup-active="true"
      className={styles.indicator}
      style={{
        width: INDICATOR_SIZE,
        height: INDICATOR_SIZE,
      }}
    >
      <UiIcon
        part={name}
        scale={ICON_SCALE}
        x={iconX}
        y={iconY}
        color={uiStyle.colors.status_bar_text}
      />
    </div>
  );
}
