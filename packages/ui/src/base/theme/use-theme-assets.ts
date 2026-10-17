import * as React from "react";

import {
  getThemeAssets,
  preloadThemeAssets,
  subscribeThemeAssets,
  type UiAssetBundle,
} from "$/base/theme/theme-assets-store";
import { useTheme, type UiColorScheme } from "$/base/theme/theme-context";

export function useThemeAssets(colorScheme?: UiColorScheme): UiAssetBundle | null {
  const context = useTheme();
  const requestedColorScheme = colorScheme ?? context.colorScheme;
  const subscribe = React.useCallback(
    (listener: () => void) => subscribeThemeAssets(requestedColorScheme, context.uiTheme, listener),
    [requestedColorScheme, context.uiTheme],
  );
  const getSnapshot = React.useCallback(
    () => getThemeAssets(requestedColorScheme, context.uiTheme),
    [requestedColorScheme, context.uiTheme],
  );
  const assets = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  React.useEffect(() => {
    void preloadThemeAssets(requestedColorScheme, context.language, context.uiTheme).catch(
      (error) => console.error(error),
    );
  }, [requestedColorScheme, context.language, context.uiTheme]);
  return React.useMemo(
    () => (assets ? { ...assets, language: context.language } : null),
    [assets, context.language],
  );
}
