import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { readGalleryAppearance, saveGalleryAppearance } from "$/adapters/appearance";
import { browserIconClipboard } from "$/adapters/icon-clipboard";
import Gallery from "$/Gallery";
import { DesktopProvider } from "@xprite/site-shell";
import { createBrowserDesktop } from "@xprite/site-shell/browser";
import { createBrowserSiteTelemetry } from "@xprite/site-shell/telemetry/browser";
import { CursorProvider } from "@xprite/ui/cursor";

createBrowserSiteTelemetry({
  production: import.meta.env.PROD,
  token: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN ?? "",
  region: import.meta.env.VITE_POSTHOG_REGION ?? "US",
  version: __XPRITE_VERSION__,
  release: __XPRITE_RELEASE__,
  captureLinks: true,
});

const desktop = createBrowserDesktop();

function GalleryApp() {
  const [preferences, setPreferences] = useState(readGalleryAppearance);
  const { theme } = preferences;
  useEffect(() => saveGalleryAppearance(preferences), [preferences]);
  return (
    <DesktopProvider manager={desktop} theme={theme}>
      <Gallery
        iconClipboard={browserIconClipboard}
        theme={theme}
        onThemeChange={(nextTheme) =>
          setPreferences((current) => ({ ...current, theme: nextTheme }))
        }
      />
    </DesktopProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CursorProvider>
      <GalleryApp />
    </CursorProvider>
  </StrictMode>,
);
