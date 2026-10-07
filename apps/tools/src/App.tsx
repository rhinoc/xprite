import { browserToolHost } from "$/adapters/tools/browser-tool-host";
import { createBrowserViewerPort } from "$/adapters/viewer/browser-viewer";
import { ToolAppearance } from "$/components/shared/tool-appearance";
import { ViewerPage } from "$/components/viewer/viewer-page";
import { ToolHostManager } from "$/managers/tools/tool-host-manager";
import { viewerCompareSearch } from "$/managers/viewer/compare-attribution";
import { ViewerManager } from "$/managers/viewer/viewer-manager";
import { DesktopAppearance } from "@xprite/site-shell";
import { createBrowserDesktop } from "@xprite/site-shell/browser";
import type { UiThemeSnapshot } from "@xprite/ui/assets";

export function createViewerApplication(initialTheme?: UiThemeSnapshot) {
  const port = createBrowserViewerPort(viewerCompareSearch(window.location.search));
  const manager = new ViewerManager(port);
  const host = new ToolHostManager(browserToolHost);
  const desktop = createBrowserDesktop({
    appearance: (initialTheme?.appearance ?? host.getAppearanceMode()) as DesktopAppearance,
  });
  return {
    view: (
      <ToolAppearance desktop={desktop} initialTheme={initialTheme}>
        <ViewerPage manager={manager} />
      </ToolAppearance>
    ),
    dispose: () => {
      manager.dispose();
      host.dispose();
    },
  };
}
