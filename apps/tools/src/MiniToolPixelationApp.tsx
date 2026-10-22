import { createMiniToolPixelationPort } from "$/adapters/minitool/minitool-pixelation";
import { MiniToolPixelationPage } from "$/components/minitool/minitool-pixelation-page";
import { ToolAppearance } from "$/components/shared/tool-appearance";
import { PixelationManager } from "$/managers/pixelation/pixelation-manager";
import { DesktopAppearance } from "@xprite/site-shell";
import { createBrowserDesktop } from "@xprite/site-shell/browser";
import type { UiThemeSnapshot } from "@xprite/ui/assets";

/** The pixelate tool as a Xiaohongshu mini tool: same manager and page, container adapters. */
export function createMiniToolPixelationApplication(initialTheme: UiThemeSnapshot) {
  const manager = new PixelationManager(createMiniToolPixelationPort());
  const desktop = createBrowserDesktop({
    // The container follows the phone's light or dark setting.
    appearance: DesktopAppearance.System,
  });
  return {
    view: (
      <ToolAppearance desktop={desktop} initialTheme={initialTheme}>
        <MiniToolPixelationPage manager={manager} />
      </ToolAppearance>
    ),
    dispose: () => manager.dispose(),
  };
}
