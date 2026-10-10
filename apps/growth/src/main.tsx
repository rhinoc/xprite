import { StrictMode, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";

import { createShowcasePort } from "$/adapters/showcase/browser-showcase";
import { mountPixelTrail } from "$/adapters/showcase/pixel-trail";
import { mountShowcaseIntro } from "$/adapters/showcase/showcase-intro-motion";
import { Showcase } from "$/components/showcase/showcase";
import { HELLO_ARTWORK_BOUNDS } from "$/managers/showcase/hello-project";
import { ShowcaseManager } from "$/managers/showcase/showcase-manager";
import { DesktopProvider } from "@xprite/site-shell";
import { createBrowserDesktop } from "@xprite/site-shell/browser";
import { createBrowserSiteTelemetry } from "@xprite/site-shell/telemetry/browser";
import { PageScrollArea, macintoshTheme } from "@xprite/ui";
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
function ShowcaseApp() {
  const language = useSyncExternalStore(manager.subscribe, getLanguage);
  return (
    <DesktopProvider
      manager={desktop}
      theme={macintoshTheme}
      language={language}
      preloadArtwork={false}
    >
      <CursorProvider>
        <PageScrollArea aria-label={language === "zh-CN" ? "页面滚动" : "Page scroll"}>
          <Showcase
            manager={manager}
            mountTrail={mountPixelTrail}
            mountIntro={mountShowcaseIntro}
          />
        </PageScrollArea>
      </CursorProvider>
    </DesktopProvider>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <ShowcaseApp />
  </StrictMode>,
);

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    root.unmount();
    manager.unmount();
  });
}
