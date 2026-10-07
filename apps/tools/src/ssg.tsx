import { StrictMode } from "react";
import { renderToString } from "react-dom/server";

import { AnimalCrossingPage } from "$/components/animal-crossing/animal-crossing-page";
import { GifSheetPage } from "$/components/gif-sheet/gif-sheet-page";
import { ToolAppearance } from "$/components/shared/tool-appearance";
import { ToolArtworkKind, toolArtworkKey } from "$/components/shared/tool-artwork";
import { ToolsHome } from "$/components/tools/tools-home";
import { ViewerPage } from "$/components/viewer/viewer-page";
import { AnimalCrossingManager } from "$/managers/animal-crossing/animal-crossing-manager";
import { GifSheetManager } from "$/managers/gif-sheet/gif-sheet-manager";
import type { AnimalCrossingPort } from "$/managers/ports/animal-crossing";
import type { GifSheetPort } from "$/managers/ports/gif-sheet";
import type { ViewerPort } from "$/managers/ports/viewer";
import { TOOL_EXAMPLES } from "$/managers/tools/tool-catalog";
import { ToolHostManager } from "$/managers/tools/tool-host-manager";
import { ViewerManager } from "$/managers/viewer/viewer-manager";
import { ToolApplicationRoot } from "$/tool-application-root";
import { AppearanceMode } from "@xprite/editor-ui/appearance";
import { DesktopManager, DesktopAppearance } from "@xprite/site-shell";
import { macintoshTheme } from "@xprite/ui";
import { loadUiThemeSnapshot, type UiThemeSnapshot } from "@xprite/ui/assets";

const unavailable = () => {
  throw new Error("Browser I/O cannot run during static rendering.");
};

/** Render the real page components with their managers' ordinary empty state. */
export async function renderToolPage(rootId: string) {
  const artwork = Object.fromEntries(
    Object.entries(TOOL_EXAMPLES).map(([path, preview]) => [
      toolArtworkKey(ToolArtworkKind.Example, path),
      preview.preview,
    ]),
  );
  const themes: Record<"light" | "dark", UiThemeSnapshot> = {
    light: await loadUiThemeSnapshot("light", macintoshTheme),
    dark: await loadUiThemeSnapshot("dark", macintoshTheme),
  };
  const render = (appearance: "light" | "dark") => {
    const ports = {
      readAppearance: () => (appearance === "dark" ? AppearanceMode.Dark : AppearanceMode.Light),
      watchAppearance: () => () => {},
      readWheel: unavailable,
      read: unavailable,
      example: unavailable,
      save: unavailable,
      saveQr: unavailable,
      savePng: unavailable,
      saveJson: unavailable,
      saveFrame: unavailable,
      saveAnimation: unavailable,
      edit: unavailable,
    } satisfies ViewerPort & GifSheetPort & AnimalCrossingPort;
    const host = new ToolHostManager(ports);
    const desktop = new DesktopManager(undefined, {
      appearance: appearance === "dark" ? DesktopAppearance.Dark : DesktopAppearance.Light,
    });
    const manager =
      rootId === "viewer-root"
        ? new ViewerManager(ports)
        : rootId === "gif-sheet-root"
          ? new GifSheetManager(ports)
          : rootId === "animal-crossing-root"
            ? new AnimalCrossingManager({ ...ports, read: unavailable })
            : null;
    try {
      const view =
        manager instanceof AnimalCrossingManager ? (
          <AnimalCrossingPage manager={manager} />
        ) : manager instanceof ViewerManager ? (
          <ViewerPage manager={manager} />
        ) : manager instanceof GifSheetManager ? (
          <GifSheetPage manager={manager} />
        ) : (
          <ToolsHome />
        );
      return renderToString(
        <StrictMode>
          <ToolApplicationRoot rootId={rootId} artwork={artwork}>
            <ToolAppearance desktop={desktop} initialTheme={themes[appearance]}>
              {view}
            </ToolAppearance>
          </ToolApplicationRoot>
        </StrictMode>,
        { identifierPrefix: rootId },
      );
    } finally {
      manager?.dispose();
      host.dispose();
    }
  };
  return { light: render("light"), dark: render("dark"), themes, artwork };
}
