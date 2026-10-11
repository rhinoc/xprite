import { type ReactNode } from "react";

import { useToolLanguage } from "$/managers/locale/tool-language";
import { AppearanceMode } from "@xprite/editor-ui/appearance";
import { DesktopAppearance, DesktopProvider, type DesktopManager } from "@xprite/site-shell";
import { macintoshTheme, UiColorScheme } from "@xprite/ui";
import type { UiThemeSnapshot } from "@xprite/ui/assets";

export function desktopAppearanceForColorScheme(colorScheme?: UiColorScheme) {
  if (!colorScheme) return undefined;
  return colorScheme === UiColorScheme.Dark ? DesktopAppearance.Dark : DesktopAppearance.Light;
}

export function desktopAppearanceForMode(mode: AppearanceMode): DesktopAppearance {
  if (mode === AppearanceMode.Dark) return DesktopAppearance.Dark;
  if (mode === AppearanceMode.System) return DesktopAppearance.System;
  return DesktopAppearance.Light;
}

export function ToolAppearance({
  desktop,
  children,
  initialTheme,
}: {
  desktop: DesktopManager;
  children: ReactNode;
  initialTheme?: UiThemeSnapshot;
}) {
  const { language, translate } = useToolLanguage();
  return (
    <DesktopProvider
      manager={desktop}
      theme={macintoshTheme}
      language={language}
      translateSource={translate}
      translateKey={translate}
      initialTheme={initialTheme}
      preloadArtwork
      // The SSG stylesheet defines the cursors once; inline they made each page 2.2 MB larger.
      cursorVariables={false}
    >
      {children}
    </DesktopProvider>
  );
}
