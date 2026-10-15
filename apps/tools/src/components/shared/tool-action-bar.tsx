import { createContext, useContext, type ReactNode } from "react";

import { useToolTranslation } from "$/managers/locale/tool-language";
import { Button, FontRole } from "@xprite/ui";

import styles from "$/components/shared/tool-flow.module.css";

/** Mac OS 8 standard button: text width + 16px, never narrower than 59px. */
const MINIMUM_EXPORT_WIDTH = 59;

export interface ToolActionBarProps {
  /** Export stays disabled until the tool has a result. */
  exportDisabled: boolean;
  onExport(): void;
}

const ToolActionBarContext = createContext<ToolActionBarProps | undefined>(undefined);
export const ToolActionBarProvider = ToolActionBarContext.Provider;

/**
 * The Export button of a flow tool, Mac OS 8 style: a standard-size default button at the
 * bottom right of the stage window, on the window's own background (no bar). It is the app's real
 * default-action `Button` (theme ring included).
 */
function ToolActionBar({ exportDisabled, onExport }: ToolActionBarProps) {
  const t = useToolTranslation();
  return (
    <div className={styles.exportFooter} data-tool-action-bar="">
      <Button
        className={styles.exportButton}
        text={t("Export…")}
        font={FontRole.Primary}
        minimumWidth={MINIMUM_EXPORT_WIDTH}
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
  );
}

/** Slot for the stage window of a flow tool: renders the shared Export button, if the shell has one. */
export function ToolStageFooter(): ReactNode {
  const props = useContext(ToolActionBarContext);
  return props ? <ToolActionBar {...props} /> : null;
}
