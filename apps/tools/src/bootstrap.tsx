import { StrictMode, type ReactNode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";

import { createBrowserFilesPort } from "$/adapters/files/browser-files";
import { browserToolAppearance } from "$/adapters/preview/browser-appearance";
import { readToolLanguage, writeToolLanguage } from "$/adapters/tools/browser-language";
import { FilesManager } from "$/managers/files/files-manager";
import { ToolApplicationRoot } from "$/tool-application-root";
import { AppearanceMode, resolveAppearanceMode } from "@xprite/editor-ui/appearance";
import { normalizeDesktopPreferences, DesktopAppearance } from "@xprite/site-shell";
import { readBrowserDesktopPreferences } from "@xprite/site-shell/browser";
import type { SiteTelemetryPort } from "@xprite/site-shell/telemetry";
import { createBrowserSiteTelemetry } from "@xprite/site-shell/telemetry/browser";
import { FontRole, UiColorScheme, macintoshTheme } from "@xprite/ui";
import { loadUiThemeSnapshot, preloadUiAssets, type UiThemeSnapshot } from "@xprite/ui/assets";

interface ToolApplication {
  view: ReactNode;
  dispose(): void;
}

const DESKTOP_APPEARANCE_BY_EDITOR: Record<AppearanceMode, DesktopAppearance> = {
  [AppearanceMode.Light]: DesktopAppearance.Light,
  [AppearanceMode.Dark]: DesktopAppearance.Dark,
  [AppearanceMode.System]: DesktopAppearance.System,
};
const EDITOR_APPEARANCE_BY_DESKTOP: Record<DesktopAppearance, AppearanceMode> = {
  [DesktopAppearance.Light]: AppearanceMode.Light,
  [DesktopAppearance.Dark]: AppearanceMode.Dark,
  [DesktopAppearance.System]: AppearanceMode.System,
};

/** Keep the generated HTML visible until bitmap controls can mount immediately. */
export async function mountToolApplication(
  rootId: string,
  createApplication: (
    initialTheme?: UiThemeSnapshot,
    telemetry?: SiteTelemetryPort,
  ) => ToolApplication,
  hot: ImportMeta["hot"],
) {
  const telemetry = createBrowserSiteTelemetry({
    production: import.meta.env.PROD,
    token: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN ?? "",
    region: import.meta.env.VITE_POSTHOG_REGION ?? "US",
    apiHost: import.meta.env.VITE_POSTHOG_API_HOST,
    version: __XPRITE_VERSION__,
    release: __XPRITE_RELEASE__,
    captureLinks: true,
  });
  let active = true;
  let application: ToolApplication | undefined;
  let root: Root | undefined = hot?.data.root;
  const previousApplication: ToolApplication | undefined = hot?.data.application;
  hot?.dispose((data) => {
    active = false;
    data.root = root;
    data.application = application ?? previousApplication;
  });
  hot?.prune(() => application?.dispose());
  const preferences = normalizeDesktopPreferences(readBrowserDesktopPreferences(), {
    appearance: DESKTOP_APPEARANCE_BY_EDITOR[browserToolAppearance.readAppearance()],
  });
  const appearance = resolveAppearanceMode(
    EDITOR_APPEARANCE_BY_DESKTOP[preferences.appearance],
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? AppearanceMode.Dark
      : AppearanceMode.Light,
  );
  const colorScheme = appearance === AppearanceMode.Dark ? UiColorScheme.Dark : UiColorScheme.Light;
  const language = readToolLanguage();
  await preloadUiAssets(colorScheme, language, macintoshTheme);
  // The page was rendered from this theme module; its asset URLs are content-addressed in both
  // builds, so hydration matches without 279 KB of theme JSON embedded in every page.
  const initialTheme = await loadUiThemeSnapshot(colorScheme, macintoshTheme);
  const typography = initialTheme.definition.typography;
  await Promise.all(
    [FontRole.Primary, FontRole.Compact].map((role) => {
      const font = typography[role];
      return document.fonts.load(`${font.fontSize}px ${font.fontFamily}`);
    }),
  );
  // Attach events after the original static artwork is decoded, keeping its first paint intact.
  await Promise.all([...document.images].map((image) => image.decode()));
  if (!active) return;
  application = createApplication(initialTheme, telemetry);
  const files: FilesManager =
    hot?.data.files ?? new FilesManager(createBrowserFilesPort(telemetry));
  hot?.dispose((data) => {
    data.files = files;
  });
  const view = (
    <StrictMode>
      <ToolApplicationRoot
        rootId={rootId}
        language={language}
        onLanguageChange={writeToolLanguage}
        files={files}
        artwork={
          root ? {} : JSON.parse(document.getElementById("tool-initial-artwork")!.textContent!)
        }
      >
        {application.view}
      </ToolApplicationRoot>
    </StrictMode>
  );
  if (root) root.render(view);
  else
    root = hydrateRoot(document.getElementById(rootId)!, view, {
      identifierPrefix: rootId,
      onRecoverableError(error) {
        document.getElementById(rootId)!.dataset.toolHydrationError = String(error);
        console.error(error);
      },
    });
  previousApplication?.dispose();
}
