import { PATTERNS, patternColorImage } from "@xprite/ui";

import { DesktopAppearance, DesktopManager, type DesktopPreferences } from "../managers/desktop";
import { DESKTOP_PREFERENCES_KEY } from "../startup";

const DESKTOP_CHANGED_EVENT = "xprite:desktop-preferences";
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

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
      },
      applyTheme(tokens, appearance, themeId) {
        document.documentElement.dataset.uiAppearance = appearance;
        for (const scope of document.querySelectorAll<HTMLElement>(
          `[data-ui-theme="${themeId}"]`,
        )) {
          scope.dataset.uiAppearance = appearance;
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
