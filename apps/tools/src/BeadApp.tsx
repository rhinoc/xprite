import { createBrowserBeadToolPort } from "$/adapters/beads/browser-beads";
import { browserToolHost } from "$/adapters/tools/browser-tool-host";
import { BeadPage } from "$/components/beads/bead-page";
import {
  desktopAppearanceForColorScheme,
  desktopAppearanceForMode,
  ToolAppearance,
} from "$/components/shared/tool-appearance";
import { BeadToolManager } from "$/managers/beads/bead-tool-manager";
import { ToolHostManager } from "$/managers/tools/tool-host-manager";
import { createBrowserDesktop } from "@xprite/site-shell/browser";
import type { SiteTelemetryPort } from "@xprite/site-shell/telemetry";
import type { UiThemeSnapshot } from "@xprite/ui/assets";

export function createBeadApplication(
  initialTheme?: UiThemeSnapshot,
  telemetry?: SiteTelemetryPort,
) {
  const manager = new BeadToolManager(createBrowserBeadToolPort(), telemetry);
  const host = new ToolHostManager(browserToolHost);
  const desktop = createBrowserDesktop({
    appearance:
      desktopAppearanceForColorScheme(initialTheme?.colorScheme) ??
      desktopAppearanceForMode(host.getAppearanceMode()),
  });
  return {
    view: (
      <ToolAppearance desktop={desktop} initialTheme={initialTheme}>
        <BeadPage manager={manager} />
      </ToolAppearance>
    ),
    dispose: () => {
      manager.dispose();
      host.dispose();
    },
  };
}
