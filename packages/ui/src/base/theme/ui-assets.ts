import type { UiAssetBundle, UiBitmap } from "$/base/theme/theme-assets-store";
import type { UiTheme } from "$/base/theme/theme-definition";
import type { UiColorRole } from "$/base/theme/theme-name-types";
import type { UiAppearance, UiStyleDefinition } from "$/base/theme/theme-types";

export interface UiAssets {
  sheet: UiBitmap;
  sheetUrl: string;
  defaultFont: UiBitmap;
  miniFont: UiBitmap;
  cjkFontReady: boolean;
  language: string;
  style: UiStyle;
  appearance: UiAppearance;
  theme: UiTheme;
  colorRoles?: Readonly<Record<string, readonly UiColorRole[]>>;
}

export interface UiStyle {
  sheet: UiStyleDefinition["sheet"];
  dimensions: UiStyleDefinition["dimensions"];
  colors: UiStyleDefinition["colors"];
  parts: UiStyleDefinition["parts"];
  typography?: UiStyleDefinition["typography"];
  controlParts?: UiStyleDefinition["controlParts"];
}

const internalAssetsByUiAssets = new WeakMap<UiAssets, UiAssetBundle>();
const uiAssetsByInternalAssets = new WeakMap<UiAssetBundle, UiAssets>();

export function exposeUiAssets(assets: UiAssetBundle): UiAssets {
  const existing = uiAssetsByInternalAssets.get(assets);
  if (existing) return existing;

  const {
    theme,
    uiTheme,
    variant,
    lightThemeColorRoles,
    sheet,
    sheetUrl,
    defaultFont,
    miniFont,
    cjkFontReady,
    language,
  } = assets;
  const uiAssets: UiAssets = {
    sheet,
    sheetUrl,
    defaultFont,
    miniFont,
    cjkFontReady,
    language,
    style: {
      sheet: theme.sheet,
      dimensions: theme.dimensions,
      colors: theme.colors,
      parts: theme.parts,
      typography: theme.typography,
      controlParts: theme.controlParts,
    },
    appearance: variant,
    theme: uiTheme,
    ...(lightThemeColorRoles ? { colorRoles: lightThemeColorRoles } : {}),
  };
  internalAssetsByUiAssets.set(uiAssets, assets);
  uiAssetsByInternalAssets.set(assets, uiAssets);
  return uiAssets;
}

export function toUiAssetBundle(assets: UiAssets): UiAssetBundle {
  const existing = internalAssetsByUiAssets.get(assets);
  if (existing) return existing;
  throw new Error("UI artwork helpers require assets returned by the UI provider");
}
