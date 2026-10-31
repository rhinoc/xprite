import { PATTERNS, patternColorImage } from "@xprite/ui";

import { SITE_LANGUAGE_PREFERENCE_KEY } from "../language-preference";
import { DesktopAppearance, DesktopManager, type DesktopPreferences } from "../managers/desktop";
import { SITE_LANGUAGES, type SiteLanguageCode } from "../site-language";
import { DESKTOP_PATTERN_IMAGE_KEY, DESKTOP_PREFERENCES_KEY } from "../startup";

export { renderArtifactSignature } from "../export/signature";
export { createArtifactRasterText } from "../export/raster-text";

const DESKTOP_CHANGED_EVENT = "xprite:desktop-preferences";
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";
export { SITE_LANGUAGE_PREFERENCE_KEY };

export function readBrowserLanguagePreference(): SiteLanguageCode | undefined {
  try {
    const language = localStorage.getItem(SITE_LANGUAGE_PREFERENCE_KEY);
    return SITE_LANGUAGES.find((supported) => supported === language);
  } catch {
    return undefined;
  }
}

export function writeBrowserLanguagePreference(language: SiteLanguageCode) {
  try {
    localStorage.setItem(SITE_LANGUAGE_PREFERENCE_KEY, language);
  } catch {
    // The selected language still applies for this page when storage is unavailable.
  }
}

export function readBrowserDesktopPreferences(): unknown {
  try {
    return JSON.parse(localStorage.getItem(DESKTOP_PREFERENCES_KEY) ?? "null");
  } catch {
    return undefined;
  }
}

export function createBrowserDesktop(defaults?: DesktopPreferences) {
  let current = readBrowserDesktopPreferences();
  return new DesktopManager(
    {
      read: () => current,
      write(preferences) {
        current = preferences;
        try {
          localStorage.setItem(DESKTOP_PREFERENCES_KEY, JSON.stringify(preferences));
        } catch {
          // Keep session controls usable when browser storage is unavailable.
        }
        window.dispatchEvent(new CustomEvent(DESKTOP_CHANGED_EVENT, { detail: preferences }));
      },
      subscribe(listener) {
        const stored = (event: StorageEvent) => {
          if (event.key === DESKTOP_PREFERENCES_KEY || event.key === null) {
            current = readBrowserDesktopPreferences();
            listener();
          }
        };
        const changed = (event: Event) => {
          current = (event as CustomEvent<DesktopPreferences>).detail;
          listener();
        };
        const media = window.matchMedia(DARK_MEDIA_QUERY);
        window.addEventListener("storage", stored);
        window.addEventListener(DESKTOP_CHANGED_EVENT, changed);
        media.addEventListener("change", listener);
        return () => {
          window.removeEventListener("storage", stored);
          window.removeEventListener(DESKTOP_CHANGED_EVENT, changed);
          media.removeEventListener("change", listener);
        };
      },
      apply(preferences) {
        document.documentElement.dataset.siteDesktop = "true";
        document.documentElement.dataset.toolAppearance =
          preferences.appearance === DesktopAppearance.System
            ? window.matchMedia(DARK_MEDIA_QUERY).matches
              ? "dark"
              : "light"
            : preferences.appearance;
        if (preferences.pattern)
          document.documentElement.dataset.uiPatternOverride = preferences.pattern;
        else delete document.documentElement.dataset.uiPatternOverride;
        const pattern = PATTERNS.find((entry) => entry.id === preferences.pattern);
        const image =
          pattern &&
          patternColorImage(pattern, preferences.patternForeground, preferences.patternBackground);
        if (image) document.documentElement.style.setProperty("--ui-pattern-override-image", image);
        else document.documentElement.style.removeProperty("--ui-pattern-override-image");
        // The startup script paints this image before load, so pages do not inline every template.
        try {
          if (image)
            localStorage.setItem(
              DESKTOP_PATTERN_IMAGE_KEY,
              JSON.stringify({ pattern: preferences.pattern, image }),
            );
          else localStorage.removeItem(DESKTOP_PATTERN_IMAGE_KEY);
        } catch {
          // Without storage the pattern still applies once this script runs.
        }
      },
      applyTheme(tokens, colorScheme, themeId) {
        document.documentElement.dataset.uiAppearance = colorScheme;
        for (const scope of document.querySelectorAll<HTMLElement>(
          `[data-ui-theme="${themeId}"]`,
        )) {
          scope.dataset.uiAppearance = colorScheme;
          for (const [name, value] of Object.entries(tokens)) {
            if (value === undefined) scope.style.removeProperty(name);
            else scope.style.setProperty(name, value);
          }
        }
      },
    },
    defaults,
  );
}
