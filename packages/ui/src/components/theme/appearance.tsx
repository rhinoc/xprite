import * as React from "react";

import {
  centerThemePixel,
  getThemeAssets,
  measureThemeText,
  paintThemeIcon,
  paintThemePart,
  paintThemeText,
  preloadThemeAssets,
  themeControlSize,
  themeFontHeight,
  useThemeAssets,
} from "$/base/components/theme-controls";
import { themeGlyphAssets } from "$/base/theme/theme-assets";
import {
  UIProvider as InternalThemeProvider,
  useSystemTheme,
  useTheme,
} from "$/base/theme/theme-context";
import type { UiAppearance as Appearance } from "$/base/theme/theme-context";
import { themeMetrics } from "$/base/theme/theme-metrics";
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

export interface UIProviderProps {
  appearance?: Appearance;
  language?: string;
  translateKey?: (key: string) => string;
  translateSource?: (source: string) => string;
  children: React.ReactNode;
}

export interface UiContextValue {
  appearance: Appearance;
  style: UiStyle;
  sheetUrl: string;
  language: string;
  translateKey: (key: string) => string;
  translateSource: (source: string) => string;
}

export function UIProvider({ appearance, ...props }: UIProviderProps) {
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    return connectStylusPointerRegions(document);
  }, []);
  return <InternalThemeProvider {...props} theme={appearance} />;
}

export function useUi(): UiContextValue {
  const { variant, definition, ...context } = useTheme();
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
    () => ({ ...context, appearance: variant, style }),
    [context, style, variant],
  );
}

export function useUiAppearance(): Appearance {
  return useUi().appearance;
}

export function useSystemAppearance(): Appearance {
  return useSystemTheme();
}

export async function preloadUiAssets(appearance: Appearance, language = "en"): Promise<UiAssets> {
  return exposeUiAssets(await preloadThemeAssets(appearance, language));
}

export function getUiAssets(appearance: Appearance): UiAssets | undefined {
  const assets = getThemeAssets(appearance);
  return assets ? exposeUiAssets(assets) : undefined;
}

export function useUiAssets(appearance?: Appearance): UiAssets | null {
  const assets = useThemeAssets(appearance);
  return React.useMemo(() => (assets ? exposeUiAssets(assets) : null), [assets]);
}

export const uiGlyphAssets = themeGlyphAssets;
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
