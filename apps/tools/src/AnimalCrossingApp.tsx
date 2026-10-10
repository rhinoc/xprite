import { createBrowserAnimalCrossingPort } from "$/adapters/animal-crossing/browser-animal-crossing";
import { browserIslandPreview } from "$/adapters/animal-crossing/ground/browser-ground-preview";
import { browserToolHost } from "$/adapters/tools/browser-tool-host";
import { AnimalCrossingPage } from "$/components/animal-crossing/animal-crossing-page";
import { ToolAppearance } from "$/components/shared/tool-appearance";
import { AnimalCrossingManager } from "$/managers/animal-crossing/animal-crossing-manager";
import { ToolHostManager } from "$/managers/tools/tool-host-manager";
import { DesktopAppearance } from "@xprite/site-shell";
import { createBrowserDesktop } from "@xprite/site-shell/browser";
import type { SiteTelemetryPort } from "@xprite/site-shell/telemetry";
import type { UiThemeSnapshot } from "@xprite/ui/assets";
export function createAnimalCrossingApplication(
  initialTheme?: UiThemeSnapshot,
  telemetry?: SiteTelemetryPort,
) {
  const manager = new AnimalCrossingManager(
    createBrowserAnimalCrossingPort(),
    browserIslandPreview,
    telemetry,
  );
  const host = new ToolHostManager(browserToolHost);
  const desktop = createBrowserDesktop({
    appearance: (initialTheme?.appearance ?? host.getAppearanceMode()) as DesktopAppearance,
  });
  return {
    view: (
      <ToolAppearance desktop={desktop} initialTheme={initialTheme}>
        <AnimalCrossingPage manager={manager} />
      </ToolAppearance>
    ),
    dispose: () => {
      manager.dispose();
      host.dispose();
    },
  };
}
