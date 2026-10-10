import { type ReactNode } from "react";

import { useToolLanguage } from "$/managers/locale/tool-language";
import { DesktopProvider, type DesktopManager } from "@xprite/site-shell";
import { macintoshTheme } from "@xprite/ui";
import type { UiThemeSnapshot } from "@xprite/ui/assets";

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
    >
      {children}
    </DesktopProvider>
  );
}
