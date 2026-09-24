import { useEffect, useRef } from "react";

import type { UiElementScale } from "$/managers/preferences/ui-element-scale";
import { useEditorChromePreferences } from "$/managers/shell/editor-chrome-preferences-context";

/** Preview stays session-local until Apply/OK; closing restores the last applied scale. */
export function useUiElementScalePreview(open: boolean) {
  const preferences = useEditorChromePreferences();
  const latest = useRef(preferences);
  latest.current = preferences;
  const committed = useRef<UiElementScale | null>(null);
  const cancel = () => {
    if (committed.current === null) return;
    latest.current.previewUiElementScale(committed.current);
    committed.current = null;
  };
  useEffect(() => {
    if (open) committed.current = latest.current.uiElementScale;
    else cancel();
    return cancel;
  }, [open]);
  return {
    scale: preferences.uiElementScale,
    preview: preferences.previewUiElementScale,
    apply: () => {
      committed.current = latest.current.uiElementScale;
      latest.current.commitUiElementScale();
    },
    cancel,
  };
}
