import { StrictMode, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createShowcasePort } from "$/adapters/showcase/browser-showcase";
import { mountPixelTrail } from "$/adapters/showcase/pixel-trail";
import { mountShowcaseIntro } from "$/adapters/showcase/showcase-intro-motion";
import { mountShowcaseStoryAnimations } from "$/adapters/showcase/story-animations";
import { Showcase } from "$/components/showcase/showcase";
import { HELLO_ARTWORK_BOUNDS } from "$/managers/showcase/hello-project";
import { ShowcaseManager } from "$/managers/showcase/showcase-manager";
import { DesktopAppearance, DesktopProvider } from "@xprite/site-shell";
import { createBrowserDesktop } from "@xprite/site-shell/browser";
import { createBrowserSiteTelemetry } from "@xprite/site-shell/telemetry/browser";
import { PageScrollArea, macintoshTheme } from "@xprite/ui";
import { loadUiThemeSnapshot, type UiThemeSnapshot } from "@xprite/ui/assets";
import { CursorProvider } from "@xprite/ui/cursor";

createBrowserSiteTelemetry({
  production: import.meta.env.PROD,
  token: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN ?? "",
  region: import.meta.env.VITE_POSTHOG_REGION ?? "US",
  version: __XPRITE_VERSION__,
  release: __XPRITE_RELEASE__,
  captureLinks: true,
});

const manager = new ShowcaseManager(
  createShowcasePort({
    artworkBounds: HELLO_ARTWORK_BOUNDS,
  }),
);
const desktop = createBrowserDesktop();
const getLanguage = () => manager.getSnapshot().language;
function ShowcaseApp({ initialTheme }: { initialTheme: UiThemeSnapshot }) {
  const language = useSyncExternalStore(manager.subscribe, getLanguage);
  return (
    <DesktopProvider
      manager={desktop}
      theme={macintoshTheme}
      language={language}
      initialTheme={initialTheme}
      preloadArtwork={false}
    >
      <CursorProvider>
        <PageScrollArea aria-label={language === "zh-CN" ? "页面滚动" : "Page scroll"}>
          <Showcase
            manager={manager}
            mountTrail={mountPixelTrail}
            mountIntro={mountShowcaseIntro}
            mountStoryAnimations={mountShowcaseStoryAnimations}
          />
        </PageScrollArea>
      </CursorProvider>
    </DesktopProvider>
  );
}

let active = true;
let root: Root | undefined;

/** Keep the static first paint visible until the theme can render synchronously. */
async function mountShowcase() {
  const preference = desktop.getSnapshot().appearance;
  const appearance =
    preference === DesktopAppearance.System
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? DesktopAppearance.Dark
        : DesktopAppearance.Light
      : preference;
  const initialTheme = await loadUiThemeSnapshot(appearance, macintoshTheme);
  if (!active) return;
  root = createRoot(document.getElementById("root")!);
  root.render(
    <StrictMode>
      <ShowcaseApp initialTheme={initialTheme} />
    </StrictMode>,
  );
}

void mountShowcase().catch((error) => console.error("Unable to mount showcase", error));

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    active = false;
    root?.unmount();
    manager.unmount();
  });
}
