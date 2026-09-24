import { useState, useSyncExternalStore } from "react";

import { ColorPickerPreferences } from "$/managers/colors/color-picker-preferences";
import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import { useOptionalEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";

export { ColorPickerMode } from "$/managers/colors/color-picker-preferences";

export function useColorPickerPreferences() {
  const runtime = useOptionalEditorRuntimeManagerContext();
  const platform = useEditorPlatformPorts();
  const [standalone] = useState(() => new ColorPickerPreferences(platform?.preferences));
  const preferences = runtime?.workspace.colorPickerPreferences ?? standalone;
  const mode = useSyncExternalStore(
    preferences.subscribe,
    preferences.getMode,
    preferences.getMode,
  );
  return { mode, setMode: preferences.setMode };
}
