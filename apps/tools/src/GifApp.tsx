import { createBrowserGifSheetPort } from "$/adapters/gif-sheet/browser-gif-sheet";
import { browserToolHost } from "$/adapters/tools/browser-tool-host";
import { GifSheetPage } from "$/components/gif-sheet/gif-sheet-page";
import { ToolAppearance } from "$/components/shared/tool-appearance";
import { GifSheetManager } from "$/managers/gif-sheet/gif-sheet-manager";
import { ToolHostManager } from "$/managers/tools/tool-host-manager";
import { DesktopAppearance } from "@xprite/site-shell";
import { createBrowserDesktop } from "@xprite/site-shell/browser";
import type { SiteTelemetryPort } from "@xprite/site-shell/telemetry";
import type { UiThemeSnapshot } from "@xprite/ui/assets";

export function createGifSheetApplication(
  initialTheme?: UiThemeSnapshot,
  telemetry?: SiteTelemetryPort,
) {
  const manager = new GifSheetManager(createBrowserGifSheetPort(), telemetry);
  const host = new ToolHostManager(browserToolHost);
  const desktop = createBrowserDesktop({
    appearance: (initialTheme?.appearance ?? host.getAppearanceMode()) as DesktopAppearance,
  });
  return {
    view: (
      <ToolAppearance desktop={desktop} initialTheme={initialTheme}>
        <GifSheetPage manager={manager} />
      </ToolAppearance>
    ),
    dispose: () => {
      manager.dispose();
      host.dispose();
    },
  };
}
