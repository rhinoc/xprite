export enum AppearanceMode {
  Light = "light",
  Dark = "dark",
  System = "system",
}
export type ResolvedAppearance = Exclude<AppearanceMode, AppearanceMode.System>;
export const APPEARANCE_MODE_STORAGE_KEY = "xse.ui.appearance-mode.v1";

export function resolveAppearanceMode(
  mode: AppearanceMode,
  system: ResolvedAppearance,
): ResolvedAppearance {
  return mode === AppearanceMode.System ? system : mode;
}

export function readAppearanceMode(storage: {
  getItem(key: string): string | null;
}): AppearanceMode {
  try {
    const saved = storage.getItem(APPEARANCE_MODE_STORAGE_KEY);
    if (
      saved === AppearanceMode.Light ||
      saved === AppearanceMode.Dark ||
      saved === AppearanceMode.System
    )
      return saved;
  } catch {
    /* Storage is optional; the editor's default is light. */
  }
  return AppearanceMode.Light;
}
