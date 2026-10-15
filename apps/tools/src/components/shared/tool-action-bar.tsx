import { createContext, useContext, type ReactNode } from "react";

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
  /** Phone drawer toggle. Only present once there is a result; hidden on desktop. */
  adjust?: { open: boolean; onToggle(): void };
  /**
   * `window` (default for flow tools) hands the bar to the stage window as its bottom edge via
   * `useToolWindowFooter`; `frame` renders it as a strip under the tool.
   */
  placement?: "frame" | "window";
}

/** The bar as the stage window's footer, so it reads as one unit with the window. */
export const ToolWindowFooterContext = createContext<ReactNode>(null);
export const useToolWindowFooter = () => useContext(ToolWindowFooterContext);

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
  placement = "frame",
}: ToolActionBarProps) {
  const t = useToolTranslation();
  return (
    <StatusBar
      className={styles.actionBar}
      data-placement={placement}
      border={placement === "frame"}
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
