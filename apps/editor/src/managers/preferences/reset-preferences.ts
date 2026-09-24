export enum PreferenceResetTarget {
  Configuration = "configuration",
  Tools = "tools",
  Filters = "filters",
  UserShades = "user-shades",
  InstalledResources = "installed-resources",
  RecentFiles = "recent-files",
  PerFile = "per-file",
  Windows = "windows",
  UserBrushes = "user-brushes",
}

export const DEFAULT_PREFERENCE_RESET_TARGETS = [PreferenceResetTarget.Configuration];

export const SUPPORTED_PREFERENCE_RESET_TARGETS = [
  PreferenceResetTarget.Configuration,
  PreferenceResetTarget.Tools,
  PreferenceResetTarget.Filters,
  PreferenceResetTarget.PerFile,
  PreferenceResetTarget.UserBrushes,
  PreferenceResetTarget.UserShades,
  PreferenceResetTarget.RecentFiles,
];
