import {
  DEFAULT_COMPONENTS_APPEARANCE,
  COMPONENTS_THEMES,
  type ComponentsAppearance,
} from "$/managers/appearance";

const COMPONENTS_APPEARANCE_STORAGE_KEY = "xprite.components.appearance";

export function readComponentsAppearance(): ComponentsAppearance {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(COMPONENTS_APPEARANCE_STORAGE_KEY) ?? "null",
    );
    if (!stored || typeof stored !== "object") return DEFAULT_COMPONENTS_APPEARANCE;
    const theme = COMPONENTS_THEMES.find(
      (option) => "theme" in stored && option.id === stored.theme,
    );
    return {
      theme: theme ?? DEFAULT_COMPONENTS_APPEARANCE.theme,
    };
  } catch {
    return DEFAULT_COMPONENTS_APPEARANCE;
  }
}

export function saveComponentsAppearance({ theme }: ComponentsAppearance): void {
  try {
    localStorage.setItem(COMPONENTS_APPEARANCE_STORAGE_KEY, JSON.stringify({ theme: theme.id }));
  } catch {
    // Keep the controls usable when browser storage is unavailable.
  }
}
