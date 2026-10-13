/** Static pages share the UI package's generated Macintosh palette with the showcase. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ARTICLES } from "../content/articles/index.ts";
import { unlocalizedPath } from "../content/site/language.ts";
import { siteFooterGroups } from "../content/site/navigation.ts";
import { renderPublicUi } from "./static-ui-renderer.ts";

const DESKTOP_PATTERN_ASSET_ROOT = fileURLToPath(
  new URL("../../../packages/ui/assets/patterns/macintosh/", import.meta.url),
);
interface PatternAsset {
  id: string;
  label: string;
  file: string;
  width: number;
  height: number;
  kind: string;
}
const DESKTOP_PATTERN_ASSETS = JSON.parse(
  readFileSync(resolve(DESKTOP_PATTERN_ASSET_ROOT, "catalog.json"), "utf8"),
) as readonly PatternAsset[];
const PATTERN_HASH_SEED = 2166136261;
const PATTERN_HASH_MULTIPLIER = 16777619;
function patternHash(value: string): number {
  let hash = PATTERN_HASH_SEED;
  for (const character of value)
    hash = Math.imul(hash ^ character.charCodeAt(0), PATTERN_HASH_MULTIPLIER);
  return hash >>> 0;
}

// Shuffle by canonical path once: current articles get distinct patterns, stable across renders.
const FIXED_COLOR_PATTERN_KIND = "color";
const colorPatterns = DESKTOP_PATTERN_ASSETS.filter(
  (pattern) => pattern.kind === FIXED_COLOR_PATTERN_KIND,
);
const shuffledPatterns = [...colorPatterns].sort(
  (left, right) => patternHash(left.id) - patternHash(right.id),
);
const articlePatterns = new Map(
  ARTICLES.map((article) => article.path)
    .sort((left, right) => patternHash(left) - patternHash(right) || left.localeCompare(right))
    .map((path, index) => [path, shuffledPatterns[index % shuffledPatterns.length].id]),
);
export function publicPattern(path: string): string {
  const originalPath = unlocalizedPath(path);
  return (
    articlePatterns.get(originalPath) ?? colorPatterns[patternHash(path) % colorPatterns.length].id
  );
}

export const GROWTH_DESKTOP_STYLE_PATH = "/theme/growth-desktop.css";
export const PUBLIC_HELP_ICON_PATH = "/theme/help.svg";
export const PUBLIC_LANGUAGE_ICON_PATH = "/theme/language.svg";
export function publicIconLink(label: string, href: string, variant = "folder"): string {
  return renderPublicUi("icon", { label, href, variant });
}
export function publicDesktopWindow(
  title: string,
  content: string,
  attributes = "",
  footer = "",
  heading = false,
): string {
  const props: Record<string, string | boolean> = {};
  for (const match of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
    const key = match[1] === "class" ? "className" : match[1];
    props[key] = match[2] ?? true;
  }
  return renderPublicUi("window", { title, content, attributes: props, footer, heading });
}
export function publicDesktopNavigation(props: Record<string, unknown>): string {
  return renderPublicUi("navigation", props);
}
export function publicSiteFooter(language = "en"): string {
  return renderPublicUi("site-footer", { language, groups: siteFooterGroups(language) });
}
export function publicDesktopButton(href: string, label: string, className?: string): string {
  return renderPublicUi("button", { href, label, className });
}
export function publicNotFound(language: string): string {
  return renderPublicUi("not-found", { language });
}
/** Apply the theme once around server-composed page content. */
export function publicUiScope(content: string, language = "en"): string {
  return publicStaticPage(renderPublicUi("page", { content, language }));
}

/** Resolve templates before the browser paints or React hydrates any island. */
function initializePublicPage() {
  const DARK_APPEARANCE = "dark";
  const LIGHT_APPEARANCE = "light";
  const THEME_TEMPLATE_SELECTOR = "template[data-public-ui-dark]";
  const WORKSPACE_SELECTOR = "[data-ui-desktop-workspace],[data-public-desktop]";
  const WINDOW_SELECTOR = "[data-ui-desktop-window]";
  const PRIMARY_PRIORITY = "primary";
  const root = document.documentElement;
  const dark = root.dataset.toolAppearance === DARK_APPEARANCE;
  root.dataset.uiAppearance = dark ? DARK_APPEARANCE : LIGHT_APPEARANCE;
  const template = document.querySelector<HTMLTemplateElement>(THEME_TEMPLATE_SELECTOR);
  if (template) {
    if (dark) template.previousElementSibling!.replaceWith(template.content);
    template.remove();
  }
  for (const workspace of document.querySelectorAll(WORKSPACE_SELECTOR)) {
    const windows = Array.from(workspace.querySelectorAll<HTMLElement>(WINDOW_SELECTOR)).filter(
      (node) => node.closest(WORKSPACE_SELECTOR) === workspace,
    );
    const active =
      windows.find((node) => node.dataset.uiWindowPriority === PRIMARY_PRIORITY) ?? windows[0];
    for (const node of windows) node.dataset.uiWindowActive = String(node === active);
  }
}

export function publicPageStartupScript(): string {
  return `(${initializePublicPage.toString()})()`;
}

export function publicStaticPage(markup: string): string {
  return `${markup}<script>${publicPageStartupScript()}</script>`;
}

export function publicReaderScroll(content: string, language = "en"): string {
  return renderPublicUi("reader", { content, language });
}
export function publicStatus(label: string, trailing: string, href?: string): string {
  return renderPublicUi("status", { label, trailing, href });
}
export function publicRichText(content: string, attributes: Record<string, unknown> = {}): string {
  return renderPublicUi("rich-text", { content, attributes });
}
export function publicIndex(label: string, items: { label: string; href: string }[]): string {
  return renderPublicUi("index", { label, items });
}
export const PUBLIC_THEME_STYLE_PATH = "/theme/macintosh.css";
export const PUBLIC_THEME_ATTRIBUTES = 'data-ui-theme="macintosh" data-ui-appearance="light"';
export const PUBLIC_FONT_STYLE_PATH = "/theme/fonts.css";
export const PUBLIC_FONT_PATH = "/theme/chikarego2.woff2";
export const PUBLIC_MINI_FONT_PATH = "/theme/finderskeepers.woff2";
