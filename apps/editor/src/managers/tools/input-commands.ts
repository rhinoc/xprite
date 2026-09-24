import { useCallback } from "react";

import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";

/** Return focus to the drawing surface after an editor option is committed. */
export function useReleaseEditorInputFocus(): (element: HTMLElement) => void {
  const ports = useEditorPlatformPorts();
  return useCallback((element: HTMLElement) => ports?.input.releaseEditorFocus(element), [ports]);
}
