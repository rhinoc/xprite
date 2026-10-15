import { useToolTranslation } from "$/managers/locale/tool-language";
import { Button, FontRole, StatusBar } from "@xprite/ui";

import styles from "$/components/shared/tool-flow.module.css";

export interface ToolActionBarProps {
  /** Export stays disabled until the tool has a result. */
  exportDisabled: boolean;
  onExport(): void;
}

/**
 * The shared bottom bar of every tool: one full-width Export button, nothing else. It is the
 * app's real default-action `Button` (theme ring included), stretched to the bar's width.
 */
export function ToolActionBar({ exportDisabled, onExport }: ToolActionBarProps) {
  const t = useToolTranslation();
  return (
    <StatusBar className={styles.actionBar} border={false} data-tool-action-bar="">
      <div className={styles.exportBox}>
        <Button
          className={styles.exportButton}
          text={t("Export…")}
          font={FontRole.Primary}
          part="button_focused"
          hotPart="button_hot"
          focusedPart="button_focused"
          pushedPart="button_selected"
          disabled={exportDisabled}
          aria-haspopup="dialog"
          data-flow-export=""
          onClick={onExport}
        />
      </div>
    </StatusBar>
  );
}
