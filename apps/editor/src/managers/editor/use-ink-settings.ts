import { useRef, useState } from "react";

import {
  defaultToolInkSettings,
  updateToolInkSettings,
  type Ink,
  type ToolInkSettingsMap,
} from "$/managers/preferences/tool-ink-settings";

export type { Ink } from "$/managers/preferences/tool-ink-settings";

/** Per-editor tool ink controls; it owns preferences only, not drawing settings. */
export function useAsepriteInkSettings(tool: string, tools: readonly string[]) {
  const [settings, setSettings] = useState<ToolInkSettingsMap>({});
  const [shared, setSharedState] = useState(false);
  const share = useRef(false);
  const current = settings[tool] ?? defaultToolInkSettings;
  const setInk = (ink: Ink) =>
    setSettings((previous) => updateToolInkSettings(previous, tools, tool, { ink }, share.current));
  const setOpacity = (opacity: number) =>
    setSettings((previous) =>
      updateToolInkSettings(previous, tools, tool, { opacity }, share.current),
    );
  const setShared = (value: boolean) => {
    share.current = value;
    setSharedState(value);
    if (value)
      setSettings((previous) =>
        updateToolInkSettings(
          previous,
          tools,
          tool,
          previous[tool] ?? defaultToolInkSettings,
          true,
        ),
      );
  };
  const reset = () => {
    share.current = false;
    setSharedState(false);
    setSettings({});
  };
  return { ...current, shared, setInk, setOpacity, setShared, reset };
}
