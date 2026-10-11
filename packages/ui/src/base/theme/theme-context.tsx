import * as React from "react";

import { defaultUiTheme } from "$/base/theme/default-theme";
import { getThemeAssets, preloadThemeAssets } from "$/base/theme/theme-assets-store";
import type { UiAssetBundle } from "$/base/theme/theme-assets-store";
import { ThemeContext, type ThemeContextValue } from "$/base/theme/theme-context-instance";
import type { UiTheme } from "$/base/theme/theme-definition";
import {
  loadThemeModule,
  type ThemeModule,
  type UiThemeSnapshot,
} from "$/base/theme/theme-module-loader";
import type { UiColorRole } from "$/base/theme/theme-name-types";
import { ThemeScope } from "$/base/theme/theme-scope";
import { themeTokens } from "$/base/theme/theme-tokens";
import { UiColorScheme, type UiStyleDefinition } from "$/base/theme/theme-types";

export type { AtlasPartName } from "$/base/theme/theme-name-types";
export { UiColorScheme };
export type { UiStyleDefinition } from "$/base/theme/theme-types";

export function useSystemTheme(): UiColorScheme {
  const read = (): UiColorScheme =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? UiColorScheme.Dark
      : UiColorScheme.Light;
  const [colorScheme, setColorScheme] = React.useState<UiColorScheme>(read);
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setColorScheme(query.matches ? UiColorScheme.Dark : UiColorScheme.Light);
    update();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, []);
  return colorScheme;
}

export type ThemeColorRole = UiColorRole;
export type ThemeColorRoleIndex = Readonly<Record<string, readonly ThemeColorRole[]>>;

const identity = (text: string) => text;

export interface UIProviderProps {
  colorScheme?: UiColorScheme;
  uiTheme?: UiTheme;
  language?: string;
  /** Wait for bitmap artwork before mounting controls. CSS-only pages can disable this. */
  preloadArtwork?: boolean;
  initialTheme?: UiThemeSnapshot;
  /** Context only when an ancestor already supplies this theme's CSS variables. */
  scope?: boolean;
  translateKey?: (key: string) => string;
  translateSource?: (source: string) => string;
  children: React.ReactNode;
}

export function UIProvider({
  colorScheme: requestedColorScheme,
  uiTheme: requestedTheme,
  language,
  preloadArtwork = true,
  initialTheme,
  scope = true,
  translateKey,
  translateSource,
  children,
}: UIProviderProps) {
  const parent = React.useContext(ThemeContext);
  const uiTheme = requestedTheme ?? parent?.uiTheme ?? defaultUiTheme;
  const colorScheme =
    requestedColorScheme ?? parent?.colorScheme ?? initialTheme?.colorScheme ?? UiColorScheme.Light;
  const resolvedLanguage = language ?? parent?.language ?? "en";
  const [loaded, setLoaded] = React.useState<UiAssetBundle | ThemeModule | null>(() =>
    initialTheme ? null : getThemeAssets(colorScheme, uiTheme),
  );

  React.useEffect(() => {
    let active = true;
    const loading = preloadArtwork
      ? preloadThemeAssets(colorScheme, resolvedLanguage, uiTheme)
      : loadThemeModule(colorScheme, uiTheme);
    void loading
      .then((assets) => {
        if (active) setLoaded(assets);
      })
      .catch((error) => console.error(error));
    return () => {
      active = false;
    };
  }, [colorScheme, uiTheme, resolvedLanguage, preloadArtwork]);

  const initial = React.useMemo<ThemeModule | null>(
    () =>
      initialTheme && initialTheme.themeId === uiTheme.id
        ? {
            uiTheme,
            colorScheme: initialTheme.colorScheme,
            tokens: initialTheme.tokens,
            definition: initialTheme.definition,
            sheetUrl: initialTheme.sheetUrl,
          }
        : null,
    [initialTheme, uiTheme],
  );
  const matches = (candidate: UiAssetBundle | ThemeModule | ThemeContextValue | null) =>
    candidate?.colorScheme === colorScheme && candidate.uiTheme === uiTheme;
  // Retain the initial content while a saved color scheme loads after hydration.
  const current = matches(loaded)
    ? loaded
    : matches(parent)
      ? parent
      : matches(initial)
        ? initial
        : (loaded ?? initial);
  const value = React.useMemo<ThemeContextValue | null>(
    () =>
      current
        ? {
            colorScheme: current.colorScheme,
            uiTheme: current.uiTheme,
            tokens: themeTokens(
              {
                definition: "theme" in current ? current.theme : current.definition,
                sheetUrl: current.sheetUrl,
                tokens: current.tokens,
              },
              parent?.tokens,
            ),
            definition: "theme" in current ? current.theme : current.definition,
            sheetUrl: current.sheetUrl,
            language: resolvedLanguage,
            translateKey: translateKey ?? parent?.translateKey ?? identity,
            translateSource: translateSource ?? parent?.translateSource ?? identity,
          }
        : null,
    [current, uiTheme, parent, resolvedLanguage, translateKey, translateSource],
  );
  if (!value) return null;
  return (
    <ThemeContext.Provider value={value}>
      {scope ? <ThemeScope>{children}</ThemeScope> : children}
    </ThemeContext.Provider>
  );
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
  colorScheme: UiColorScheme,
  lightColorRoles: ThemeColorRoleIndex = {},
) {
  if (colorScheme === UiColorScheme.Light) return value;
  const roles = lightColorRoles[normalizeColor(value)];
  if (!roles) return value;
  const destinations = [...new Set(roles.map((role) => themeColor(role, theme)))];
  if (destinations.length !== 1) return value;
  return destinations[0] || value;
}
