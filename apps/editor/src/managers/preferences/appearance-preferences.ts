/** Preview, apply, accept and cancel for appearance values such as the mode and the theme. */
export interface AppearancePreferencesTransaction<T> {
  readonly current: T;
  readonly committed: T;
  readonly open: boolean;
}
export type AppearancePreferencesAction<T> =
  | { type: "preview"; mode: T }
  | { type: "apply" | "accept" | "cancel" };
export function beginAppearancePreferences<T>(mode: T): AppearancePreferencesTransaction<T> {
  return { current: mode, committed: mode, open: true };
}
export function updateAppearancePreferences<T>(
  state: AppearancePreferencesTransaction<T>,
  action: AppearancePreferencesAction<T>,
): AppearancePreferencesTransaction<T> {
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
