import { useState } from "react";

import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";

const ADVANCED_TILESET_OPTIONS_KEY = "xse.tilemap.advanced-tileset-options.v1";

function readAdvancedTilesetOptions(storage: ReturnType<typeof useEditorPlatformPorts>): boolean {
  try {
    return storage?.preferences.getItem(ADVANCED_TILESET_OPTIONS_KEY) === "true";
  } catch {
    return false;
  }
}

function saveAdvancedTilesetOptions(
  storage: ReturnType<typeof useEditorPlatformPorts>,
  value: boolean,
): void {
  try {
    storage?.preferences.setItem(ADVANCED_TILESET_OPTIONS_KEY, String(value));
  } catch {
    // Keep the preference for this dialog session when storage is unavailable.
  }
}

export function useAdvancedTilesetOptions(): [boolean, (value: boolean) => void] {
  const storage = useEditorPlatformPorts();
  const [advanced, setAdvanced] = useState(() => readAdvancedTilesetOptions(storage));
  return [
    advanced,
    (value) => {
      setAdvanced(value);
      saveAdvancedTilesetOptions(storage, value);
    },
  ];
}
