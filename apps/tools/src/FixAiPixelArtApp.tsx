import { createBrowserPixelationPort } from "$/adapters/pixelation/browser-pixelation";
import { browserToolHost } from "$/adapters/tools/browser-tool-host";
import { FixAiPixelArtPage } from "$/components/pixelation/fix-ai-pixel-art-page";
import {
  desktopAppearanceForColorScheme,
  desktopAppearanceForMode,
  ToolAppearance,
} from "$/components/shared/tool-appearance";
import { PixelationManager } from "$/managers/pixelation/pixelation-manager";
import { ToolHostManager } from "$/managers/tools/tool-host-manager";
import { createBrowserDesktop } from "@xprite/site-shell/browser";
import type { UiThemeSnapshot } from "@xprite/ui/assets";

export function createFixAiPixelArtApplication(initialTheme?: UiThemeSnapshot) {
  const manager = new PixelationManager(createBrowserPixelationPort());
  const host = new ToolHostManager(browserToolHost);
  const desktop = createBrowserDesktop({
    appearance:
      desktopAppearanceForColorScheme(initialTheme?.colorScheme) ??
      desktopAppearanceForMode(host.getAppearanceMode()),
  });
  return {
    view: (
      <ToolAppearance desktop={desktop} initialTheme={initialTheme}>
        <FixAiPixelArtPage manager={manager} />
      </ToolAppearance>
    ),
    dispose: () => {
      manager.dispose();
      host.dispose();
    },
  };
}
