import { createBrowserPixelationPort } from "$/adapters/pixelation/browser-pixelation";
import { browserToolHost } from "$/adapters/tools/browser-tool-host";
import { PixelationPage } from "$/components/pixelation/pixelation-page";
import {
  desktopAppearanceForColorScheme,
  desktopAppearanceForMode,
  ToolAppearance,
} from "$/components/shared/tool-appearance";
import { paletteSlugFromSearch } from "$/managers/pixelation/palette-query";
import { PixelationManager } from "$/managers/pixelation/pixelation-manager";
import { ToolHostManager } from "$/managers/tools/tool-host-manager";
import { createBrowserDesktop } from "@xprite/site-shell/browser";
import type { UiThemeSnapshot } from "@xprite/ui/assets";
export function createPixelationApplication(initialTheme?: UiThemeSnapshot) {
  const manager = new PixelationManager(createBrowserPixelationPort(), {
    paletteSlug: paletteSlugFromSearch(window.location.search),
  });
  const host = new ToolHostManager(browserToolHost);
  const desktop = createBrowserDesktop({
    appearance:
      desktopAppearanceForColorScheme(initialTheme?.colorScheme) ??
      desktopAppearanceForMode(host.getAppearanceMode()),
  });
  return {
    view: (
      <ToolAppearance desktop={desktop} initialTheme={initialTheme}>
        <PixelationPage manager={manager} />
      </ToolAppearance>
    ),
    dispose: () => {
      manager.dispose();
      host.dispose();
    },
  };
}
