import { createContext, useContext, type ReactNode } from "react";

import { useToolTranslation } from "$/managers/locale/tool-language";
import { Button, ButtonAppearance, FontRole, Icon, IconKind, IconSize } from "@xprite/ui";

import styles from "$/components/shared/tool-flow.module.css";

/** Mac OS 8 standard button: text width + 16px, never narrower than 59px. */
const MINIMUM_EXPORT_WIDTH = 59;

export interface ToolActionBarProps {
  /** Export is disabled while the tool is busy; the shell renders the button only once there is a result. */
  exportDisabled: boolean;
  onExport(): void;
  /** Present when the tool can hand its result to the editor as a new project. */
  onEditMore?(): void;
  editMoreDisabled?: boolean;
  /** Return the tool to its empty import step on this page (Mac OS 8 “New”). */
  onNew?(): void;
  /** Host-specific labels; a custom export label runs directly instead of opening a sheet. */
  exportLabel?: string;
  editMoreLabel?: string;
}

const ToolActionBarContext = createContext<ToolActionBarProps | undefined>(undefined);
export const ToolActionBarProvider = ToolActionBarContext.Provider;

/**
 * The Export button of a flow tool, Mac OS 8 style: a standard-size default button at the
 * bottom right of the stage window, on the window's own background (no bar). It is the app's real
 * default-action `Button` (theme ring included). "Edit more" sits to its left as a plain standard
 * button (no ring), only when the tool can open its result in the editor.
 */
function ToolActionBar({
  exportDisabled,
  onExport,
  onEditMore,
  editMoreDisabled = false,
  exportLabel,
  editMoreLabel,
}: ToolActionBarProps) {
  const t = useToolTranslation();
  return (
    <div className={styles.exportFooter} data-tool-action-bar="">
      {onEditMore && (
        <Button
          className={styles.exportButton}
          text={editMoreLabel ?? t("Edit more")}
          font={FontRole.Primary}
          minimumWidth={MINIMUM_EXPORT_WIDTH}
          disabled={editMoreDisabled}
          data-flow-edit-more=""
          onClick={onEditMore}
        />
      )}
      <ToolDefaultButton
        text={exportLabel ?? t("Export…")}
        disabled={exportDisabled}
        aria-haspopup={exportLabel ? undefined : "dialog"}
        data-flow-export=""
        onClick={onExport}
      />
    </div>
  );
}

/** The real default-ring `Button` at Mac OS 8 standard size: text + 16px, at least 59px, 20px tall. */
export function ToolDefaultButton({
  text,
  disabled,
  onClick,
  ...props
}: {
  text: string;
  disabled?: boolean;
  onClick(): void;
  "aria-haspopup"?: "dialog";
  "data-flow-export"?: string;
}) {
  return (
    <Button
      {...props}
      className={styles.exportButton}
      text={text}
      font={FontRole.Primary}
      minimumWidth={MINIMUM_EXPORT_WIDTH}
      part="button_focused"
      hotPart="button_hot"
      focusedPart="button_focused"
      pushedPart="button_selected"
      disabled={disabled}
      onClick={onClick}
    />
  );
}

/** Slot for the stage window of a flow tool: renders the shared Export button, if the shell has one. */
export function ToolStageFooter(): ReactNode {
  const props = useContext(ToolActionBarContext);
  return props ? <ToolActionBar {...props} /> : null;
}

/** Title-bar control on the stage window: same “New” action as the desktop icon and File ▸ New. */
export function ToolStageTitleExtra(): ReactNode {
  const props = useContext(ToolActionBarContext);
  const t = useToolTranslation();
  if (!props?.onNew) return null;
  return (
    <Button
      appearance={ButtonAppearance.Quiet}
      className={styles.titleNew}
      slots={{ leading: <Icon kind={IconKind.Document} size={IconSize.Small} /> }}
      aria-label={t("Open another file")}
      title={t("New")}
      onClick={props.onNew}
    />
  );
}
