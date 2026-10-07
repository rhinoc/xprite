import * as React from "react";

import {
  getThemeAssets,
  paintThemeIcon,
  paintThemePart,
  paintThemeText,
  preloadThemeAssets,
  themeControlSize,
  useThemeAssets,
} from "$/base/components/theme-controls";
import { defaultUiTheme } from "$/base/theme/default-theme";
import { centerThemePixel, measureThemeText, themeFontHeight } from "$/base/theme/text-metrics";
import { themeGlyphAssets } from "$/base/theme/theme-assets";
import {
  UIProvider as InternalThemeProvider,
  useSystemTheme,
  useTheme,
} from "$/base/theme/theme-context";
import type { UiAppearance as Appearance } from "$/base/theme/theme-context";
import type { UiTheme, UiThemeTokens } from "$/base/theme/theme-definition";
import { themeMetrics } from "$/base/theme/theme-metrics";
import { loadThemeModule, type UiThemeSnapshot } from "$/base/theme/theme-module-loader";
import {
  ThemeIcon as InternalAtlasIcon,
  ThemePart as InternalAtlasPart,
} from "$/base/theme/theme-part";
import type { AtlasPartName, UiPartName } from "$/base/theme/theme-part";
import { exposeUiAssets, toUiAssetBundle } from "$/base/theme/ui-assets";
import type { UiAssets, UiStyle } from "$/base/theme/ui-assets";
import { connectStylusPointerRegions } from "$/components/input/stylus-pointer-regions";

export type { UiAppearance } from "$/base/theme/theme-context";
export type { UiPartName } from "$/base/theme/theme-part";
export type { UiBitmap } from "$/base/theme/theme-assets-store";
export type { UiColorRole } from "$/base/theme/theme-name-types";
export type { UiAssets, UiStyle } from "$/base/theme/ui-assets";
export type { UiThemeSnapshot } from "$/base/theme/theme-module-loader";

export interface UIProviderProps {
  appearance?: Appearance;
  /** Independent visual skin. Inherits from the nearest provider; defaults to Aseprite. */
  theme?: UiTheme;
  language?: string;
  /** CSS-only pages can mount before bitmap artwork is loaded. Defaults to true. */
  preloadArtwork?: boolean;
  /** Use the same metadata for server HTML and the first hydration render. */
  initialTheme?: UiThemeSnapshot;
  /** Context only when an ancestor already supplies this theme's CSS variables. */
  scope?: boolean;
  translateKey?: (key: string) => string;
  translateSource?: (source: string) => string;
  children: React.ReactNode;
}

export interface UiContextValue {
  appearance: Appearance;
  theme: UiTheme;
  tokens: UiThemeTokens;
  style: UiStyle;
  sheetUrl: string;
  language: string;
  translateKey: (key: string) => string;
  translateSource: (source: string) => string;
}

export function UIProvider({ appearance, theme, ...props }: UIProviderProps) {
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    return connectStylusPointerRegions(document);
  }, []);
  return <InternalThemeProvider {...props} appearance={appearance} uiTheme={theme} />;
}

export function useUi(): UiContextValue {
  const {
    variant,
    uiTheme,
    tokens,
    definition,
    sheetUrl,
    language,
    translateKey,
    translateSource,
  } = useTheme();
  const style = React.useMemo<UiStyle>(
    () => ({
      sheet: definition.sheet,
      dimensions: definition.dimensions,
      colors: definition.colors,
      parts: definition.parts,
    }),
    [definition],
  );
  return React.useMemo(
    () => ({
      sheetUrl,
      language,
      translateKey,
      translateSource,
      appearance: variant,
      theme: uiTheme,
      tokens,
      style,
    }),
    [sheetUrl, language, translateKey, translateSource, style, variant, uiTheme, tokens],
  );
}

export function useUiAppearance(): Appearance {
  return useUi().appearance;
}

export function useSystemAppearance(): Appearance {
  return useSystemTheme();
}

export async function preloadUiAssets(
  appearance: Appearance,
  language = "en",
  theme: UiTheme = defaultUiTheme,
): Promise<UiAssets> {
  return exposeUiAssets(await preloadThemeAssets(appearance, language, theme));
}

export async function loadUiThemeSnapshot(
  appearance: Appearance,
  theme: UiTheme = defaultUiTheme,
): Promise<UiThemeSnapshot> {
  const module = await loadThemeModule(appearance, theme);
  return {
    themeId: theme.id,
    appearance,
    definition: module.definition,
    sheetUrl: module.sheetUrl,
    tokens: module.tokens,
  };
}

export function getUiAssets(
  appearance: Appearance,
  theme: UiTheme = defaultUiTheme,
): UiAssets | undefined {
  const assets = getThemeAssets(appearance, theme);
  return assets ? exposeUiAssets(assets) : undefined;
}

export function useUiAssets(appearance?: Appearance): UiAssets | null {
  const assets = useThemeAssets(appearance);
  return React.useMemo(() => (assets ? exposeUiAssets(assets) : null), [assets]);
}

export const uiGlyphAssets = themeGlyphAssets;
const DEFAULT_CHECKER = {
  cellSize: 1,
  light: [192, 192, 192] as const,
  dark: [128, 128, 128] as const,
};

export function useUiChecker() {
  const { definition } = useTheme();
  return definition.controlParts?.canvasSurface?.checker ?? DEFAULT_CHECKER;
}
export function getUiChecker(assets: UiAssets) {
  return assets.style.controlParts?.canvasSurface?.checker ?? DEFAULT_CHECKER;
}
export const measureUiText = measureThemeText;
export const centerUiPixel = centerThemePixel;
export const uiFontHeight = themeFontHeight;
export const uiControlSize = themeControlSize;
export const uiMetrics = themeMetrics;
export type UiIconProps = Omit<React.ComponentProps<typeof InternalAtlasIcon>, "part"> & {
  part: UiPartName;
};
export type UiPartProps = Omit<React.ComponentProps<typeof InternalAtlasPart>, "part"> & {
  part: UiPartName;
};

export function UiIcon({ part, ...props }: UiIconProps) {
  return <InternalAtlasIcon {...props} part={part as AtlasPartName} />;
}

export function UiPart({ part, ...props }: UiPartProps) {
  return <InternalAtlasPart {...props} part={part as AtlasPartName} />;
}

export function paintUiPart(
  context: CanvasRenderingContext2D,
  assets: UiAssets,
  part: UiPartName,
  x: number,
  y: number,
  width: number,
  height: number,
  options?: Parameters<typeof paintThemePart>[7],
) {
  return paintThemePart(context, toUiAssetBundle(assets), part, x, y, width, height, options);
}

export function paintUiIcon(
  context: CanvasRenderingContext2D,
  assets: UiAssets,
  part: UiPartName,
  x: number,
  y: number,
  options?: Parameters<typeof paintThemeIcon>[5],
) {
  return paintThemeIcon(context, toUiAssetBundle(assets), part, x, y, options);
}

export function paintUiText(
  context: CanvasRenderingContext2D,
  assets: UiAssets,
  text: string,
  x: number,
  y: number,
  options?: Parameters<typeof paintThemeText>[5],
) {
  return paintThemeText(context, toUiAssetBundle(assets), text, x, y, options);
}
