import { useCallback } from "react";

import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import { EditorCursorName } from "$/managers/ports/platform";

export function usePaletteCursorStyle() {
  const ports = useEditorPlatformPorts();
  return useCallback(
    (name: EditorCursorName, fallback?: string) =>
      ports?.input.cursorStyle(name, fallback) ?? fallback ?? "default",
    [ports],
  );
}
