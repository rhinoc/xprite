import { useMemo } from "react";

import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";

const HEIGHT_KEY = "xse.timeline.dock-height.v2";
const WIDTH_KEY = "xse.timeline.dock-width.v1";

/** Follow the surface's injected storage, including detached presentation scopes. */
export function useTimelineDockPreferences() {
  const storage = useEditorPlatformPorts()?.preferences;
  return useMemo(() => {
    const read = (key: string, minimum: number): number | null => {
      try {
        const value = Number(storage?.getItem(key));
        return Number.isFinite(value) && value >= minimum ? value : null;
      } catch {
        return null;
      }
    };
    const write = (key: string, value: number) => {
      try {
        storage?.setItem(key, String(value));
      } catch {
        // Keep the current size when persistence is unavailable.
      }
    };
    return {
      readHeight: (minimum: number, fallback: number) => read(HEIGHT_KEY, minimum) ?? fallback,
      readWidth: (minimum: number) => read(WIDTH_KEY, minimum),
      saveHeight: (height: number) => write(HEIGHT_KEY, height),
      saveWidth: (width: number) => write(WIDTH_KEY, width),
    };
  }, [storage]);
}
