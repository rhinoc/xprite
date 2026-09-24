/** OptionsCommand: preview immediately, Apply advances rollback, Cancel restores. */
export enum AppearanceMode {
  Light = "light",
  Dark = "dark",
  System = "system",
}
export type ResolvedAppearance = Exclude<AppearanceMode, AppearanceMode.System>;

export function resolveAppearanceMode(
  mode: AppearanceMode,
  systemAppearance: ResolvedAppearance,
): ResolvedAppearance {
  return mode === AppearanceMode.System ? systemAppearance : mode;
}
export interface AppearancePreferencesTransaction {
  readonly current: AppearanceMode;
  readonly committed: AppearanceMode;
  readonly open: boolean;
}
export type AppearancePreferencesAction =
  | { type: "preview"; mode: AppearanceMode }
  | { type: "apply" | "accept" | "cancel" };
export function beginAppearancePreferences(mode: AppearanceMode): AppearancePreferencesTransaction {
  return { current: mode, committed: mode, open: true };
}
export function updateAppearancePreferences(
  state: AppearancePreferencesTransaction,
  action: AppearancePreferencesAction,
): AppearancePreferencesTransaction {
  if (!state.open) return state;
  switch (action.type) {
    case "preview":
      return { ...state, current: action.mode };
    case "apply":
      return { ...state, committed: state.current };
    case "accept":
      return { ...state, committed: state.current, open: false };
    case "cancel":
      return { ...state, current: state.committed, open: false };
  }
}
