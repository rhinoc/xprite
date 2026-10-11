import type { PreferenceStoragePort } from "$/managers/ports/platform";
import { ColorSelectorMode, ColorWheelHarmony } from "@xprite/editor-core";

export interface ColorSelectorPreferences {
  mode: ColorSelectorMode;
  discrete: boolean;
  harmony: ColorWheelHarmony;
}
const STORAGE_KEY = "xse.workspace.color-selector.v1";
export function normalizeColorSelectorPreferences(value: unknown): ColorSelectorPreferences {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    mode: Object.values(ColorSelectorMode).includes(saved.mode as ColorSelectorMode)
      ? (saved.mode as ColorSelectorMode)
      : ColorSelectorMode.TintShadeTone,
    discrete: saved.discrete === true,
    harmony: Object.values(ColorWheelHarmony).includes(saved.harmony as ColorWheelHarmony)
      ? (saved.harmony as ColorWheelHarmony)
      : ColorWheelHarmony.None,
  };
}
export function readColorSelectorPreferences(
  storage?: PreferenceStoragePort,
): ColorSelectorPreferences {
  try {
    return normalizeColorSelectorPreferences(storage?.readJson(STORAGE_KEY));
  } catch {
    return normalizeColorSelectorPreferences(undefined);
  }
}
export function writeColorSelectorPreferences(
  value: ColorSelectorPreferences,
  storage?: PreferenceStoragePort,
): void {
  try {
    storage?.writeJson(STORAGE_KEY, value);
  } catch {
    // Keep the active workspace preference when storage is unavailable.
  }
}
