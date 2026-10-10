import { publicDesktopStartupScript } from "../../../../infra/public-desktop-startup.ts";
import { siteIcons } from "../../../../infra/site-html.ts";
import { SHOWCASE_PAGES } from "../../content/showcase/pages.ts";
import { PublicLanguage } from "../../content/site/language.ts";
import { showcaseLabel } from "../../content/site/navigation.ts";
import {
  PUBLIC_THEME_ATTRIBUTES,
  PUBLIC_THEME_STYLE_PATH,
  PUBLIC_FONT_STYLE_PATH,
  PUBLIC_FONT_PATH,
  GROWTH_DESKTOP_STYLE_PATH,
  publicPattern,
  publicDesktopNavigation,
  publicSiteFooter,
  publicUiScope,
} from "../public-theme.ts";
import { GUIDE_STYLE_PATH, CHINESE_FONT_PATH } from "./document-resources.ts";

const SITE_URL = "https://xprite.cc/";
export interface PublicDocumentPage {
  language: PublicLanguage;
  path: string;
  title: string;
  description: string;
  navigation: string;
  canonical?: boolean;
}
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);

export function publicDocumentHtml(
  page: PublicDocumentPage,
  indexable: boolean,
  body: string,
  links: readonly {
    label: string;
    href: string;
    hrefLang?: string;
    icon?: "language" | "help";
    end?: boolean;
  }[],
  alternates = "",
  mainClass = "",
): string {
  const indexing =
    indexable || page.canonical
      ? `<link rel="canonical" href="${new URL(page.path, SITE_URL).href}">\n${alternates}`
      : "";
  return `<!doctype html>
<html lang="${page.language}" ${PUBLIC_THEME_ATTRIBUTES}><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<script>${publicDesktopStartupScript()}</script>
<title>${escapeHtml(page.title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<meta name="robots" content="${indexable ? "index, follow" : "noindex, follow"}">
${indexing}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Xprite">
<meta property="og:title" content="${escapeHtml(page.title)}">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:url" content="${new URL(page.path, SITE_URL).href}">
<meta property="og:image" content="${SITE_URL}social-preview.png">
<meta property="og:image:width" content="1920">
<meta property="og:image:height" content="820">
<meta property="og:image:alt" content="Xprite pixel art editor in desktop and phone browsers">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(page.title)}">
<meta name="twitter:description" content="${escapeHtml(page.description)}">
<meta name="twitter:image" content="${SITE_URL}social-preview.png">
${siteIcons()}
<link rel="preload" href="${PUBLIC_FONT_PATH}?v=ec44f36e057a" as="font" type="font/woff2" crossorigin>
${page.language === PublicLanguage.SimplifiedChinese ? `<link rel="preload" href="${CHINESE_FONT_PATH}" as="font" type="font/woff2" crossorigin>` : ""}
<link rel="stylesheet" href="${PUBLIC_FONT_STYLE_PATH}">
<link rel="stylesheet" href="${PUBLIC_THEME_STYLE_PATH}">
<link rel="stylesheet" href="${GUIDE_STYLE_PATH}">
<link rel="stylesheet" href="${GROWTH_DESKTOP_STYLE_PATH}">
</head><body data-growth-desktop data-ui-desktop-pattern="${publicPattern(page.path)}">
${publicUiScope(
  `<header>${publicDesktopNavigation({ label: page.navigation, language: page.language, currentHref: page.path, brandLabel: showcaseLabel(page.language), brandHref: SHOWCASE_PAGES[page.language].path, brandImage: "/menu-icon.svg", links })}</header>
<main class="${mainClass}" data-public-desktop>${body}</main>${publicSiteFooter(page.language)}`,
  page.language,
)}
</body></html>\n`;
}
