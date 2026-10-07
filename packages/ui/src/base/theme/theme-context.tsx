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
  appearance?: UiAppearance;
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
  appearance,
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
  const variant = appearance ?? parent?.variant ?? initialTheme?.appearance ?? "light";
  const resolvedLanguage = language ?? parent?.language ?? "en";
  const [loaded, setLoaded] = React.useState<UiAssetBundle | ThemeModule | null>(() =>
    initialTheme ? null : getThemeAssets(variant, uiTheme),
  );

  React.useEffect(() => {
    let active = true;
    const loading = preloadArtwork
      ? preloadThemeAssets(variant, resolvedLanguage, uiTheme)
      : loadThemeModule(variant, uiTheme);
    void loading
      .then((assets) => {
        if (active) setLoaded(assets);
      })
      .catch((error) => console.error(error));
    return () => {
      active = false;
    };
  }, [variant, uiTheme, resolvedLanguage, preloadArtwork]);

  const initial = React.useMemo<ThemeModule | null>(
    () =>
      initialTheme && initialTheme.themeId === uiTheme.id
        ? {
            uiTheme,
            variant: initialTheme.appearance,
            tokens: initialTheme.tokens,
            definition: initialTheme.definition,
            sheetUrl: initialTheme.sheetUrl,
          }
        : null,
    [initialTheme, uiTheme],
  );
  const matches = (candidate: UiAssetBundle | ThemeModule | ThemeContextValue | null) =>
    candidate?.variant === variant && candidate.uiTheme === uiTheme;
  const current = matches(loaded)
    ? loaded
    : matches(parent)
      ? parent
      : matches(initial)
        ? initial
        : loaded;
  const value = React.useMemo<ThemeContextValue | null>(
    () =>
      current
        ? {
            variant: current.variant,
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
