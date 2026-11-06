import type { CSSProperties } from "react";

import { tUi } from "$/i18n";
import { Disclosure } from "@xprite/ui";
import { cn } from "@xprite/ui/utils";

import styles from "$/components/dialogs/pixelation-dialog/pixelation-dialog.module.css";

export function ImportAdvanced({
  open,
  onChange,
  disabled,
  style,
}: {
  open: boolean;
  onChange(open: boolean): void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <Disclosure
      title={tUi("import.dialog.advanced")}
      open={open}
      onClick={(event) => {
        if (disabled) event.preventDefault();
      }}
      onToggle={(event) => {
        if (disabled) {
          event.currentTarget.open = false;
          return;
        }
        onChange(event.currentTarget.open);
      }}
      className={cn(styles.advanced, disabled && styles.disabled)}
      aria-disabled={disabled || undefined}
      style={style}
    >
      {null}
    </Disclosure>
  );
}
