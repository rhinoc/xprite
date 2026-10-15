import { useToolTranslation } from "$/managers/locale/tool-language";
import { Button, FontRole, StatusBar } from "@xprite/ui";

import styles from "$/components/shared/tool-flow.module.css";

export interface ToolActionBarProps {
  /** Short step cue, for example "Generated · Adjust · Export". */
  cue: string;
  /** Quiet detail after the cue, such as the file name. */
  detail?: string;
  /** Export stays disabled until the tool has a result. */
  exportDisabled: boolean;
  onExport(): void;
  /** Phone drawer toggle. Hidden on desktop, where the palette floats. */
  adjust?: { open: boolean; disabled: boolean; onToggle(): void };
}

/**
 * The shared bottom status bar of every tool: step cue on the left, Export pinned at the
 * right in the same place on every tool. Export is the app's real default-action button.
 */
export function ToolActionBar({
  cue,
  detail,
  exportDisabled,
  onExport,
  adjust,
}: ToolActionBarProps) {
  const t = useToolTranslation();
  return (
    <StatusBar
      className={styles.actionBar}
      data-tool-action-bar=""
      aria-label={t("Export")}
      leading={
        <span className={styles.cue} role="status">
          <span>{cue}</span>
          {detail && <span className={styles.cueDetail}>{detail}</span>}
        </span>
      }
      trailing={
        <span className={styles.actions}>
          {adjust && (
            <Button
              className={styles.adjustToggle}
              text={t("Adjust")}
              font={FontRole.Primary}
              selected={adjust.open}
              disabled={adjust.disabled}
              aria-pressed={adjust.open}
              data-flow-adjust-toggle=""
              onClick={adjust.onToggle}
            />
          )}
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
        </span>
      }
    />
  );
}
