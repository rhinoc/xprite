import { StrictMode, useEffect, useLayoutEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { readComponentsAppearance, saveComponentsAppearance } from "$/adapters/appearance";
import { readComponentsLanguage, writeComponentsLanguage } from "$/adapters/components-language";
import { browserIconClipboard } from "$/adapters/icon-clipboard";
import {
  AlignmentProbe,
  ALIGNMENT_PROBE_LABELS,
  type AlignmentProbeLanguage,
} from "$/alignment-probe";
import Components from "$/Components";
import type { ComponentsAppearance } from "$/managers/appearance";
import { ComponentsLanguageProvider, useComponentsLanguage } from "$/managers/components-language";
import { publicLanguage } from "@xprite/growth-content/language";
import { DesktopAppearance, DesktopProvider } from "@xprite/site-shell";
import { createBrowserDesktop } from "@xprite/site-shell/browser";
import { createBrowserSiteTelemetry } from "@xprite/site-shell/telemetry/browser";
import { UiColorScheme } from "@xprite/ui";
import { loadUiThemeSnapshot, preloadUiAssets, type UiThemeSnapshot } from "@xprite/ui/assets";

createBrowserSiteTelemetry({
  production: import.meta.env.PROD,
  token: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN ?? "",
  region: import.meta.env.VITE_POSTHOG_REGION ?? "US",
  apiHost: import.meta.env.VITE_POSTHOG_API_HOST,
  version: __XPRITE_VERSION__,
  release: __XPRITE_RELEASE__,
  captureLinks: true,
});

const desktop = createBrowserDesktop();

/** `?alignment-probe=<en|zh-CN|ja>` swaps the gallery for the text alignment measurement page. */
const probeParameter = new URLSearchParams(window.location.search).get("alignment-probe");
const probeLanguage =
  probeParameter && probeParameter in ALIGNMENT_PROBE_LABELS
    ? (probeParameter as AlignmentProbeLanguage)
    : undefined;

function ComponentsReady() {
  useLayoutEffect(() => {
    document.getElementById("components-startup")?.remove();
    document.getElementById("root")!.dataset.componentsReady = "true";
  }, []);
  return null;
}

function ComponentsApp({
  initialTheme,
  initialPreferences,
}: {
  initialTheme: UiThemeSnapshot;
  initialPreferences: ComponentsAppearance;
}) {
  const { language, translate } = useComponentsLanguage();
  const [preferences, setPreferences] = useState(initialPreferences);
  const { theme } = preferences;
  useEffect(() => saveComponentsAppearance(preferences), [preferences]);
  return (
    <DesktopProvider
      manager={desktop}
      theme={theme}
      initialTheme={initialTheme}
      language={language}
      translateSource={translate}
      translateKey={translate}
    >
      <ComponentsReady />
      {probeLanguage ? (
        <AlignmentProbe language={probeLanguage} />
      ) : (
        <Components
          iconClipboard={browserIconClipboard}
          theme={theme}
          onThemeChange={(nextTheme) =>
            setPreferences((current) => ({ ...current, theme: nextTheme }))
          }
        />
      )}
    </DesktopProvider>
  );
}

let active = true;
let root: Root | undefined = import.meta.hot?.data.root;

async function mountComponents() {
  // The probe URL carries the script under test (`?alignment-probe=zh-CN|ja`). Wire that
  // language into preload so Asian Fusion faces load before paint; otherwise positioned-pixel
  // keeps the Latin fallback and the visual text-alignment audit fails by ~0.5–1 CSS px.
  const language = probeLanguage ? publicLanguage(probeLanguage) : readComponentsLanguage();
  writeComponentsLanguage(language);
  const initialPreferences = readComponentsAppearance();
  const preference = desktop.getSnapshot().appearance;
  const appearance =
    preference === DesktopAppearance.System
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? DesktopAppearance.Dark
        : DesktopAppearance.Light
      : preference;
  const colorScheme =
    appearance === DesktopAppearance.Dark ? UiColorScheme.Dark : UiColorScheme.Light;
  const [initialTheme] = await Promise.all([
    loadUiThemeSnapshot(colorScheme, initialPreferences.theme),
    preloadUiAssets(colorScheme, language, initialPreferences.theme),
  ]);
  if (!active) return;
  root ??= createRoot(document.getElementById("root")!);
  root.render(
    <StrictMode>
      <ComponentsLanguageProvider language={language} onChange={writeComponentsLanguage}>
        <ComponentsApp initialTheme={initialTheme} initialPreferences={initialPreferences} />
      </ComponentsLanguageProvider>
    </StrictMode>,
  );
}

void mountComponents().catch((error) => {
  console.error("Unable to mount components", error);
  const startup = document.getElementById("components-startup");
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
