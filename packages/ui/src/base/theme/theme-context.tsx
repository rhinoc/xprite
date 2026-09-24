import * as React from "react";

import { getThemeAssets, preloadThemeAssets } from "$/base/theme/theme-assets-store";
import type { UiAssetBundle } from "$/base/theme/theme-assets-store";
import { ThemeContext, type ThemeContextValue } from "$/base/theme/theme-context-instance";
import type { UiColorRole } from "$/base/theme/theme-name-types";
import type { UiStyleDefinition, UiAppearance } from "$/base/theme/theme-types";

export type { AtlasPartName } from "$/base/theme/theme-name-types";
export type { UiStyleDefinition, UiAppearance } from "$/base/theme/theme-types";

export function useSystemTheme(): UiAppearance {
  const read = (): UiAppearance =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  const [theme, setTheme] = React.useState<UiAppearance>(read);
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setTheme(query.matches ? "dark" : "light");
    update();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, []);
  return theme;
}

export type ThemeColorRole = UiColorRole;
export type ThemeColorRoleIndex = Readonly<Record<string, readonly ThemeColorRole[]>>;

const identity = (text: string) => text;

export interface UIProviderProps {
  theme?: UiAppearance;
  language?: string;
  translateKey?: (key: string) => string;
  translateSource?: (source: string) => string;
  children: React.ReactNode;
}

export function UIProvider({
  theme,
  language,
  translateKey,
  translateSource,
  children,
}: UIProviderProps) {
  const parent = React.useContext(ThemeContext);
  const variant = theme ?? parent?.variant ?? "light";
  const resolvedLanguage = language ?? parent?.language ?? "en";
  const [loaded, setLoaded] = React.useState<UiAssetBundle | null>(() => getThemeAssets(variant));

  React.useEffect(() => {
    let active = true;
    void preloadThemeAssets(variant, resolvedLanguage)
      .then((assets) => {
        if (active) setLoaded(assets);
      })
      .catch((error) => console.error(error));
    return () => {
      active = false;
    };
  }, [variant, resolvedLanguage]);

  const current = loaded?.variant === variant ? loaded : (parent ?? loaded);
  const value = React.useMemo<ThemeContextValue | null>(
    () =>
      current
        ? {
            variant: current.variant,
            definition: "theme" in current ? current.theme : current.definition,
            sheetUrl: current.sheetUrl,
            language: resolvedLanguage,
            translateKey: translateKey ?? parent?.translateKey ?? identity,
            translateSource: translateSource ?? parent?.translateSource ?? identity,
          }
        : null,
    [current, parent, resolvedLanguage, translateKey, translateSource],
  );
  if (!value) return null;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = React.useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside UIProvider");
  return value;
}

function themeColor(role: ThemeColorRole, theme: UiStyleDefinition) {
  return theme.colors[role] ?? "";
}

function normalizeColor(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return trimmed;
}

export function remapThemeColor(
  value: string,
  theme: UiStyleDefinition,
  variant: UiAppearance,
  lightColorRoles: ThemeColorRoleIndex = {},
) {
  if (variant === "light") return value;
  const roles = lightColorRoles[normalizeColor(value)];
  if (!roles) return value;
  const destinations = [...new Set(roles.map((role) => themeColor(role, theme)))];
  if (destinations.length !== 1) return value;
  return destinations[0] || value;
}
