import { StrictMode, useEffect, useLayoutEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { readGalleryAppearance, saveGalleryAppearance } from "$/adapters/appearance";
import { readGalleryLanguage, writeGalleryLanguage } from "$/adapters/gallery-language";
import { browserIconClipboard } from "$/adapters/icon-clipboard";
import Gallery from "$/Gallery";
import type { GalleryAppearance } from "$/managers/appearance";
import { GalleryLanguageProvider, useGalleryLanguage } from "$/managers/gallery-language";
import { DesktopAppearance, DesktopProvider } from "@xprite/site-shell";
import { createBrowserDesktop } from "@xprite/site-shell/browser";
import { createBrowserSiteTelemetry } from "@xprite/site-shell/telemetry/browser";
import { loadUiThemeSnapshot, preloadUiAssets, type UiThemeSnapshot } from "@xprite/ui/assets";
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

function GalleryReady() {
  useLayoutEffect(() => {
    document.getElementById("gallery-startup")?.remove();
    document.getElementById("root")!.dataset.galleryReady = "true";
  }, []);
  return null;
}

function GalleryApp({
  initialTheme,
  initialPreferences,
}: {
  initialTheme: UiThemeSnapshot;
  initialPreferences: GalleryAppearance;
}) {
  const { language, translate } = useGalleryLanguage();
  const [preferences, setPreferences] = useState(initialPreferences);
  const { theme } = preferences;
  useEffect(() => saveGalleryAppearance(preferences), [preferences]);
  return (
    <DesktopProvider
      manager={desktop}
      theme={theme}
      initialTheme={initialTheme}
      language={language}
      translateSource={translate}
      translateKey={translate}
    >
      <GalleryReady />
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

let active = true;
let root: Root | undefined = import.meta.hot?.data.root;

async function mountGallery() {
  const language = readGalleryLanguage();
  writeGalleryLanguage(language);
  const initialPreferences = readGalleryAppearance();
  const preference = desktop.getSnapshot().appearance;
  const appearance =
    preference === DesktopAppearance.System
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? DesktopAppearance.Dark
        : DesktopAppearance.Light
      : preference;
  const [initialTheme] = await Promise.all([
    loadUiThemeSnapshot(appearance, initialPreferences.theme),
    preloadUiAssets(appearance, language, initialPreferences.theme),
  ]);
  if (!active) return;
  root ??= createRoot(document.getElementById("root")!);
  root.render(
    <StrictMode>
      <CursorProvider>
        <GalleryLanguageProvider language={language} onChange={writeGalleryLanguage}>
          <GalleryApp initialTheme={initialTheme} initialPreferences={initialPreferences} />
        </GalleryLanguageProvider>
      </CursorProvider>
    </StrictMode>,
  );
}

void mountGallery().catch((error) => {
  console.error("Unable to mount gallery", error);
  const startup = document.getElementById("gallery-startup");
  if (startup) {
    startup.textContent = "Unable to load components. Reload to try again.";
    startup.setAttribute("role", "alert");
  }
});

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => {
    active = false;
    data.root = root;
  });
}
