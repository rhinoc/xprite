import { tUi, useUiLanguage } from "$/i18n";
import { useInputModeNotice } from "$/managers/input/use-input-mode-notice";
import { Toast } from "@xprite/ui";

export function InputModeNotice() {
  const notice = useInputModeNotice();
  useUiLanguage();

  return <Toast text={notice ? tUi(notice) : null} />;
}
