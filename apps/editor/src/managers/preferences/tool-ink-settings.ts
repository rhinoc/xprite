import { AsepriteInk } from "@xprite/editor-core";
import { UINT8_MAX } from "@xprite/editor-core";

export type { AsepriteInk as Ink } from "@xprite/editor-core";
export interface ToolInkSettings {
  ink: AsepriteInk;
  opacity: number;
}
export type ToolInkSettingsMap = Record<string, ToolInkSettings>;
export const defaultToolInkSettings: ToolInkSettings = {
  ink: AsepriteInk.Simple,
  opacity: UINT8_MAX,
};

/** ContextBar::InkTypeField/InkOpacityField share only ink and opacity. */
export function updateToolInkSettings(
  current: ToolInkSettingsMap,
  tools: readonly string[],
  activeTool: string,
  change: Partial<ToolInkSettings>,
  shared: boolean,
): ToolInkSettingsMap {
  const result = { ...current };
  for (const tool of shared ? tools : [activeTool]) {
    const next = { ...(current[tool] ?? defaultToolInkSettings), ...change };
    next.opacity = Math.max(0, Math.min(UINT8_MAX, Math.round(next.opacity)));
    result[tool] = next;
  }
  return result;
}
