const SPRITE_SHEET_FILE = "startup-loading.webp";
/** Development and builds without content versioning keep the authored query. */
const FALLBACK_QUERY = "?v=xprite-2";

/**
 * The build appends a content version to the `<link rel="preload">` in index.html, so request
 * that exact URL. A different query string is a second download, and the browser warns that
 * the preload was never used.
 */
export function startupSpriteSheetUrl(preloadHrefs: readonly string[], baseUrl: string): string {
  return (
    preloadHrefs.find((href) => href.split(/[?#]/)[0].endsWith(`/${SPRITE_SHEET_FILE}`)) ??
    `${baseUrl}${SPRITE_SHEET_FILE}${FALLBACK_QUERY}`
  );
}
