import {
  DEFAULT_GALLERY_APPEARANCE,
  GALLERY_THEMES,
  type GalleryAppearance,
} from "$/managers/appearance";

const GALLERY_APPEARANCE_STORAGE_KEY = "xprite.gallery.appearance";

export function readGalleryAppearance(): GalleryAppearance {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(GALLERY_APPEARANCE_STORAGE_KEY) ?? "null",
    );
    if (!stored || typeof stored !== "object") return DEFAULT_GALLERY_APPEARANCE;
    const theme = GALLERY_THEMES.find((option) => "theme" in stored && option.id === stored.theme);
    return {
      theme: theme ?? DEFAULT_GALLERY_APPEARANCE.theme,
    };
  } catch {
    return DEFAULT_GALLERY_APPEARANCE;
  }
}

export function saveGalleryAppearance({ theme }: GalleryAppearance): void {
  try {
    localStorage.setItem(GALLERY_APPEARANCE_STORAGE_KEY, JSON.stringify({ theme: theme.id }));
  } catch {
    // Keep the controls usable when browser storage is unavailable.
  }
}
