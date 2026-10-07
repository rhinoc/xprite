import { browserToolHost } from "$/adapters/tools/browser-tool-host";
import { ToolAppearance } from "$/components/shared/tool-appearance";
import { ToolsHome } from "$/components/tools/tools-home";
import { ToolHostManager } from "$/managers/tools/tool-host-manager";
import { DesktopAppearance } from "@xprite/site-shell";
import { createBrowserDesktop } from "@xprite/site-shell/browser";
import type { UiThemeSnapshot } from "@xprite/ui/assets";

export function createToolsHomeApplication(initialTheme?: UiThemeSnapshot) {
  const host = new ToolHostManager(browserToolHost);
  const desktop = createBrowserDesktop({
    appearance: (initialTheme?.appearance ?? host.getAppearanceMode()) as DesktopAppearance,
  });
  return {
    view: (
      <ToolAppearance desktop={desktop} initialTheme={initialTheme}>
        <ToolsHome />
      </ToolAppearance>
    ),
    dispose: () => host.dispose(),
  };
}
