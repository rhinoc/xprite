import type { CSSProperties } from "react";

import { tUi } from "$/i18n";
import { Disclosure } from "@xprite/ui";

import styles from "$/components/dialogs/pixelation-dialog/pixelation-dialog.module.css";

export function ImportAdvanced({
  open,
  onChange,
  style,
}: {
  open: boolean;
  onChange(open: boolean): void;
  style?: CSSProperties;
}) {
  return (
    <Disclosure
      title={tUi("import.dialog.advanced")}
      open={open}
      onToggle={(event) => onChange(event.currentTarget.open)}
      className={styles.advanced}
      style={style}
    >
      {null}
    </Disclosure>
  );
}
