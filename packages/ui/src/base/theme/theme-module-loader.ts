import type { UiColorRole } from "$/base/theme/theme-name-types";
import type { UiStyleDefinition, UiAppearance } from "$/base/theme/theme-types";

export interface ThemeModule {
  variant: UiAppearance;
  definition: UiStyleDefinition;
  sheetUrl: string;
  lightThemeColorRoles?: Readonly<Record<string, readonly UiColorRole[]>>;
}

type GeneratedThemeModule = {
  themeDefinition: UiStyleDefinition;
  sheetUrl: string;
  lightThemeColorRoles?: Readonly<Record<string, readonly UiColorRole[]>>;
};

const moduleLoaders: Record<UiAppearance, () => Promise<GeneratedThemeModule>> = {
  light: () => import("$/base/theme/generated/themes/aseprite-light"),
  dark: () => import("$/base/theme/generated/themes/aseprite-dark"),
};
const modulePromises = new Map<UiAppearance, Promise<ThemeModule>>();

export function loadThemeModule(variant: UiAppearance): Promise<ThemeModule> {
  const cached = modulePromises.get(variant);
  if (cached) return cached;
  const promise = moduleLoaders[variant]().then(
    ({ themeDefinition, sheetUrl, lightThemeColorRoles }) => ({
      variant,
      definition: themeDefinition,
      sheetUrl,
      lightThemeColorRoles,
    }),
  );
  modulePromises.set(variant, promise);
  void promise.catch(() => {
    if (modulePromises.get(variant) === promise) modulePromises.delete(variant);
  });
  return promise;
}
