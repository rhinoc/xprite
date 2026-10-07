import { StrictMode, type ReactNode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";

import { browserToolAppearance } from "$/adapters/preview/browser-appearance";
import { ToolApplicationRoot } from "$/tool-application-root";
import { AppearanceMode, resolveAppearanceMode } from "@xprite/editor-ui/appearance";
import { normalizeDesktopPreferences, DesktopAppearance } from "@xprite/site-shell";
import { readBrowserDesktopPreferences } from "@xprite/site-shell/browser";
import { macintoshTheme } from "@xprite/ui";
import { preloadUiAssets, type UiThemeSnapshot } from "@xprite/ui/assets";

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
  createApplication: (initialTheme?: UiThemeSnapshot) => ToolApplication,
  hot: ImportMeta["hot"],
) {
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
  await preloadUiAssets(appearance, "en", macintoshTheme);
  const initialThemes = JSON.parse(
    document.getElementById("tool-initial-themes")!.textContent!,
  ) as Record<"light" | "dark", UiThemeSnapshot>;
  await Promise.all(
    Object.values(initialThemes[appearance].definition.typography ?? {}).map((font) =>
      document.fonts.load(`${font.fontSize}px ${font.fontFamily}`),
    ),
  );
  // Attach events after the original static artwork is decoded, keeping its first paint intact.
  await Promise.all([...document.images].map((image) => image.decode()));
  if (!active) return;
  application = createApplication(initialThemes[appearance]);
  const view = (
    <StrictMode>
      <ToolApplicationRoot
        rootId={rootId}
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
