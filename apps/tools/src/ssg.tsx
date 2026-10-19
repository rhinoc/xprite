import { StrictMode } from "react";
import { renderToString } from "react-dom/server";

import { AnimalCrossingPage } from "$/components/animal-crossing/animal-crossing-page";
import { BeadPage } from "$/components/beads/bead-page";
import { GifSheetPage } from "$/components/gif-sheet/gif-sheet-page";
import { PixelationPage } from "$/components/pixelation/pixelation-page";
import { ToolAppearance } from "$/components/shared/tool-appearance";
import { ToolArtworkKind, toolArtworkKey } from "$/components/shared/tool-artwork";
import { ViewerPage } from "$/components/viewer/viewer-page";
import { AnimalCrossingManager } from "$/managers/animal-crossing/animal-crossing-manager";
import { BeadToolManager } from "$/managers/beads/bead-tool-manager";
import { GifSheetManager } from "$/managers/gif-sheet/gif-sheet-manager";
import { PixelationManager } from "$/managers/pixelation/pixelation-manager";
import type { AnimalCrossingPort } from "$/managers/ports/animal-crossing";
import type { BeadToolPort } from "$/managers/ports/beads";
import type { GifSheetPort } from "$/managers/ports/gif-sheet";
import type { ViewerPort } from "$/managers/ports/viewer";
import { TOOL_EXAMPLES } from "$/managers/tools/tool-catalog";
import { ToolHostManager } from "$/managers/tools/tool-host-manager";
import { ViewerManager } from "$/managers/viewer/viewer-manager";
import { ToolApplicationRoot } from "$/tool-application-root";
import { AppearanceMode } from "@xprite/editor-ui/appearance";
import { LOCALIZED_LANGUAGES, PublicLanguage } from "@xprite/growth-content/language";
import { DesktopManager, DesktopAppearance } from "@xprite/site-shell";
import { UiColorScheme, macintoshTheme } from "@xprite/ui";
import { loadUiThemeSnapshot, type UiThemeSnapshot } from "@xprite/ui/assets";
import { cursorScopeStyle } from "@xprite/ui/cursor";

const unavailable = () => {
  throw new Error("Browser I/O cannot run during static rendering.");
};

/** Cursor variables for the page stylesheet; `ToolAppearance` leaves them off its scope. */
export function toolCursorVariables(artworkUrl: (svg: string) => string) {
  return cursorScopeStyle({ theme: macintoshTheme, artworkUrl }) as Record<string, string>;
}

/** Render the real page components with their managers' ordinary empty state. */
export async function renderToolPage(rootId: string) {
  const artwork = Object.fromEntries(
    Object.entries(TOOL_EXAMPLES).map(([path, preview]) => [
      toolArtworkKey(ToolArtworkKind.Example, path),
      preview.preview,
    ]),
  );
  const themes: Record<UiColorScheme, UiThemeSnapshot> = {
    [UiColorScheme.Light]: await loadUiThemeSnapshot(UiColorScheme.Light, macintoshTheme),
    [UiColorScheme.Dark]: await loadUiThemeSnapshot(UiColorScheme.Dark, macintoshTheme),
  };
  const render = (appearance: "light" | "dark", language: PublicLanguage) => {
    const colorScheme = appearance === "dark" ? UiColorScheme.Dark : UiColorScheme.Light;
    const ports = {
      readAppearance: () => (appearance === "dark" ? AppearanceMode.Dark : AppearanceMode.Light),
      watchAppearance: () => () => {},
      readWheel: unavailable,
      preview: unavailable,
      releasePreview: () => {},
      read: unavailable,
      example: unavailable,
      save: unavailable,
      saveQr: unavailable,
      savePng: unavailable,
      saveJson: unavailable,
      savePdf: unavailable,
      saveFrame: unavailable,
      saveAnimation: unavailable,
      edit: unavailable,
    } satisfies ViewerPort & GifSheetPort & AnimalCrossingPort & BeadToolPort;
    const host = new ToolHostManager(ports);
    const desktop = new DesktopManager(undefined, {
      appearance: appearance === "dark" ? DesktopAppearance.Dark : DesktopAppearance.Light,
    });
    const manager =
      rootId === "beads-root"
        ? new BeadToolManager(ports)
        : rootId === "viewer-root"
          ? new ViewerManager(ports)
          : rootId === "gif-sheet-root"
            ? new GifSheetManager(ports)
            : rootId === "pixelation-root"
              ? new PixelationManager({
                  readWheel: unavailable,
                  paletteResources: () => ({ choices: [], defaultPalette: [] }),
                  detectGrid: unavailable,
                  read: unavailable,
                  example: unavailable,
                  convert: unavailable,
                  save: unavailable,
                  edit: unavailable,
                  dispose: () => {},
                })
              : rootId === "animal-crossing-root"
                ? new AnimalCrossingManager({ ...ports, read: unavailable })
                : null;
    try {
      const view =
        manager instanceof BeadToolManager ? (
          <BeadPage manager={manager} />
        ) : manager instanceof PixelationManager ? (
          <PixelationPage manager={manager} />
        ) : manager instanceof AnimalCrossingManager ? (
          <AnimalCrossingPage manager={manager} />
        ) : manager instanceof ViewerManager ? (
          <ViewerPage manager={manager} />
        ) : manager instanceof GifSheetManager ? (
          <GifSheetPage manager={manager} />
        ) : null;
      return renderToString(
        <StrictMode>
          <ToolApplicationRoot rootId={rootId} artwork={artwork} language={language}>
            <ToolAppearance desktop={desktop} initialTheme={themes[colorScheme]}>
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
  return {
    light: render("light", PublicLanguage.English),
    dark: render("dark", PublicLanguage.English),
    localized: LOCALIZED_LANGUAGES.map((language) => ({
      language,
      light: render("light", language),
      dark: render("dark", language),
    })),
    themes,
    artwork,
  };
}
