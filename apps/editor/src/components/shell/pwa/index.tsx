import { tUi, useUiLanguage } from "$/i18n";
import { usePwaManager, usePwaState } from "$/managers/pwa/pwa-context";
import { PwaInstallMethod, PwaNotice } from "$/managers/pwa/pwa-manager";
import { Button, Panel, Text, TextVariant, Toast, useUi } from "@xprite/ui";

import styles from "$/components/shell/pwa/pwa-update-prompt.module.css";

function desktopInstructions(method: PwaInstallMethod): string {
  switch (method) {
    case PwaInstallMethod.Ios:
      return tUi("ui.pwa.desktop.ios");
    case PwaInstallMethod.Safari:
      return tUi("ui.pwa.desktop.safari");
    case PwaInstallMethod.Prompt:
    case PwaInstallMethod.BrowserMenu:
      return tUi("ui.pwa.desktop.browser");
    case PwaInstallMethod.None:
      return "";
  }
}

/**
 * A lazy chunk failed twice, so this page runs a replaced release. The prompt stays until the
 * user acts. Reloading is never automatic: unsaved edits and undo history live in this page.
 */
function UpdatePrompt({ onDismiss }: { onDismiss(): void }) {
  const { style: theme } = useUi();
  return (
    <div className={styles.host} role="alert" data-testid="pwa-update-prompt">
      <Panel
        className={styles.prompt}
        style={{
          background: theme.colors.tooltip_face,
          color: theme.colors.tooltip_text,
          borderColor: theme.colors.window_titlebar_text,
        }}
      >
        <Text variant={TextVariant.Inline} scale={2} wrap ink={theme.colors.tooltip_text}>
          {tUi("ui.pwa.update.available")}
        </Text>
        <div className={styles.actions}>
          <Button text={tUi("ui.pwa.update.dismiss")} onClick={onDismiss} />
          <Button text={tUi("ui.pwa.update.reload")} onClick={() => window.location.reload()} />
        </div>
      </Panel>
    </div>
  );
}

/** Brief guidance reuses the editor's non-interactive notice; background updates stay silent. */
export function PwaNotifications() {
  const state = usePwaState();
  const manager = usePwaManager();
  useUiLanguage();
  if (state?.notice === PwaNotice.UpdateAvailable)
    return <UpdatePrompt onDismiss={() => manager?.dismissNotice()} />;
  // A stale build matters even where installation is unsupported.
  const text = !state?.supported
    ? null
    : state.notice === PwaNotice.AddToDesktopHint
      ? tUi("ui.pwa.desktop.hint")
      : state.notice === PwaNotice.DesktopInstructions
        ? desktopInstructions(state.installMethod)
        : null;
  return <Toast text={text} />;
}
