/** Pin mutable public stylesheets to the build that rendered each page. */
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

const HTML_EXTENSION = ".html";
const HASHED_ASSET_PREFIX = "/assets/";
const VERSION_PARAMETER = "v";
const VERSION_LENGTH = 12;
const STYLESHEET_LINK =
  /(<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["'])(\/[^"'?#]+\.css)(["'])/gi;

export function stylesheetVersion(css: string | Uint8Array): string {
  return createHash("sha256").update(css).digest("hex").slice(0, VERSION_LENGTH);
}

/**
 * Stable stylesheet addresses such as `/theme/growth-desktop.css` are cached by the CDN
 * under their URL. Without a content version, a new page can render against the previous
 * release's selectors. Hashed `/assets/` files already carry their version in the name.
 */
export function versionStylesheetLinks(
  html: string,
  versionOf: (pathname: string) => string | undefined,
): string {
  return html.replace(STYLESHEET_LINK, (link, start: string, pathname: string, end: string) => {
    if (pathname.startsWith(HASHED_ASSET_PREFIX)) return link;
    const version = versionOf(pathname);
    return version ? `${start}${pathname}?${VERSION_PARAMETER}=${version}${end}` : link;
  });
}

async function htmlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(HTML_EXTENSION))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** Rewrite every emitted page after all public stylesheets have been written. */
export async function versionPublishedStylesheets(output: string): Promise<void> {
  const pages = await htmlFiles(output);
  const sources = await Promise.all(pages.map((page) => readFile(page, "utf8")));
  const pathnames = new Set(
    sources.flatMap((html) => Array.from(html.matchAll(STYLESHEET_LINK), (match) => match[2])),
  );
  const versions = new Map<string, string>();
  await Promise.all(
    Array.from(pathnames, async (pathname) => {
      const filename = resolve(output, `.${pathname}`);
      if (!filename.startsWith(`${output}${sep}`)) return;
      const css = await readFile(filename).catch(() => undefined);
      if (css) versions.set(pathname, stylesheetVersion(css));
    }),
  );
  await Promise.all(
    pages.map(async (page, index) => {
      const html = versionStylesheetLinks(sources[index], (pathname) => versions.get(pathname));
      if (html !== sources[index]) await writeFile(page, html);
    }),
  );
}
