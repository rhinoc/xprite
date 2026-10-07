import { type ReactNode } from "react";

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
  return (
    <DesktopProvider
      manager={desktop}
      theme={macintoshTheme}
      language="en"
      initialTheme={initialTheme}
      preloadArtwork
    >
      {children}
    </DesktopProvider>
  );
}
