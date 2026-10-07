import { tUi, useUiLanguage } from "$/i18n";
import { usePwaState } from "$/managers/pwa/pwa-context";
import { PwaInstallMethod, PwaNotice } from "$/managers/pwa/pwa-manager";
import { Toast } from "@xprite/ui";

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

/** Brief guidance reuses the editor's non-interactive notice; background updates stay silent. */
export function PwaNotifications() {
  const state = usePwaState();
  useUiLanguage();
  const text = !state?.supported
    ? null
    : state.notice === PwaNotice.AddToDesktopHint
      ? tUi("ui.pwa.desktop.hint")
      : state.notice === PwaNotice.DesktopInstructions
        ? desktopInstructions(state.installMethod)
        : null;
  return <Toast text={text} />;
}
