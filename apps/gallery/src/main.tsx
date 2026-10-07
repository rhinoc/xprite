import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { readGalleryAppearance, saveGalleryAppearance } from "$/adapters/appearance";
import { browserIconClipboard } from "$/adapters/icon-clipboard";
import Gallery from "$/Gallery";
import { DesktopProvider } from "@xprite/site-shell";
import { createBrowserDesktop } from "@xprite/site-shell/browser";
import { CursorProvider } from "@xprite/ui/cursor";

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
