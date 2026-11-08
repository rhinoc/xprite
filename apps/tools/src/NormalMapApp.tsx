import { createBrowserNormalMapPort } from "$/adapters/normal-map/browser-normal-map";
import { browserToolHost } from "$/adapters/tools/browser-tool-host";
import { NormalMapPage } from "$/components/normal-map/normal-map-page";
import {
  desktopAppearanceForColorScheme,
  desktopAppearanceForMode,
  ToolAppearance,
} from "$/components/shared/tool-appearance";
import { NormalMapManager } from "$/managers/normal-map/normal-map-manager";
import { ToolHostManager } from "$/managers/tools/tool-host-manager";
import { createBrowserDesktop } from "@xprite/site-shell/browser";
import type { SiteTelemetryPort } from "@xprite/site-shell/telemetry";
import type { UiThemeSnapshot } from "@xprite/ui/assets";

export function createNormalMapApplication(
  initialTheme?: UiThemeSnapshot,
  telemetry?: SiteTelemetryPort,
) {
  const manager = new NormalMapManager(createBrowserNormalMapPort(), telemetry);
  const host = new ToolHostManager(browserToolHost);
  const desktop = createBrowserDesktop({
    appearance:
      desktopAppearanceForColorScheme(initialTheme?.colorScheme) ??
      desktopAppearanceForMode(host.getAppearanceMode()),
  });
  return {
    view: (
      <ToolAppearance desktop={desktop} initialTheme={initialTheme}>
        <NormalMapPage manager={manager} />
      </ToolAppearance>
    ),
    dispose: () => {
      manager.dispose();
      host.dispose();
    },
  };
}
