import { browserLocalStorage } from "@xprite/bedrock/browser/localstorage";
import {
  APPEARANCE_MODE_STORAGE_KEY,
  readAppearanceMode,
  type AppearanceMode,
} from "@xprite/editor-ui/appearance";

export const browserToolAppearance = {
  readAppearance: () => readAppearanceMode(browserLocalStorage),
  watchAppearance(listener: (mode: AppearanceMode) => void) {
    const changed = (event: StorageEvent) => {
      if (event.key === APPEARANCE_MODE_STORAGE_KEY)
        listener(readAppearanceMode(browserLocalStorage));
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  },
};
