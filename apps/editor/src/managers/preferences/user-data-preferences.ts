import type { PreferenceStoragePort } from "$/managers/ports/platform";

export enum UserDataVisibilityScope {
  Sprite = "sprite",
  Layer = "layer",
  Cel = "cel",
  Tag = "tag",
  Slice = "slice",
}

export type UserDataVisibilityPreferences = Readonly<Record<UserDataVisibilityScope, boolean>>;

export const DEFAULT_USER_DATA_VISIBILITY_PREFERENCES: UserDataVisibilityPreferences = {
  [UserDataVisibilityScope.Sprite]: false,
  [UserDataVisibilityScope.Layer]: false,
  [UserDataVisibilityScope.Cel]: false,
  [UserDataVisibilityScope.Tag]: false,
  [UserDataVisibilityScope.Slice]: false,
};

const USER_DATA_VISIBILITY_PREFERENCE_KEY = "xse.workspace.user-data-visibility.v1";

export function readUserDataVisibilityPreferences(
  storage: PreferenceStoragePort,
): UserDataVisibilityPreferences {
  try {
    const saved = storage.readJson(USER_DATA_VISIBILITY_PREFERENCE_KEY) as Partial<
      Record<UserDataVisibilityScope, unknown>
    > | null;
    return Object.fromEntries(
      Object.values(UserDataVisibilityScope).map((scope) => [
        scope,
        typeof saved?.[scope] === "boolean"
          ? saved[scope]
          : DEFAULT_USER_DATA_VISIBILITY_PREFERENCES[scope],
      ]),
    ) as UserDataVisibilityPreferences;
  } catch {
    return DEFAULT_USER_DATA_VISIBILITY_PREFERENCES;
  }
}

export function writeUserDataVisibilityPreferences(
  storage: PreferenceStoragePort,
  preferences: UserDataVisibilityPreferences,
): void {
  try {
    storage.writeJson(USER_DATA_VISIBILITY_PREFERENCE_KEY, preferences);
  } catch {
    /* Keep the updated visibility choices for this session if storage is unavailable. */
  }
}
