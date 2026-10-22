const DESKTOP_PATTERN = /\sdata-ui-desktop-pattern="([^"]+)"/;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The wallpaper behind the startup desktop is the page's largest paint, but as a CSS background
 * the browser only finds it after layout. Return its URL so the head can preload it.
 */
export function desktopWallpaperUrl(html: string, css: string): string | undefined {
  const pattern = DESKTOP_PATTERN.exec(html)?.[1];
  if (!pattern) return undefined;
  const rule = new RegExp(
    `\\[data-ui-desktop-pattern=["']?${escapeRegExp(pattern)}["']?\\]\\s*\\{[^}]*?background-image:\\s*url\\(\\s*["']?([^"')]+)`,
  );
  const url = rule.exec(css)?.[1];
  if (!url) throw new Error(`No background image for desktop pattern ${pattern}`);
  return url;
}
