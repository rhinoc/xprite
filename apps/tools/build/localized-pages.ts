import { pickText, PublicLanguage } from "../../growth/content/site/language.ts";
import {
  ANIMAL_CROSSING_TOOL,
  BEADS_TOOL,
  GIF_SHEET_TOOL,
  PIXELATE_TOOL,
  TOOL_HEADING_ID,
  toolHeading,
  translateToolText,
  VIEWER_TOOL,
  type PublicTool,
} from "../../growth/content/tools/index.ts";

/** The startup root each tool page renders into and hydrates. */
export const TOOL_BY_ROOT: Readonly<Record<string, PublicTool>> = {
  "viewer-root": VIEWER_TOOL,
  "gif-sheet-root": GIF_SHEET_TOOL,
  "pixelation-root": PIXELATE_TOOL,
  "animal-crossing-root": ANIMAL_CROSSING_TOOL,
  "beads-root": BEADS_TOOL,
};

const OPEN_GRAPH_LOCALES: Readonly<Record<PublicLanguage, string>> = {
  [PublicLanguage.English]: "en_US",
  [PublicLanguage.SimplifiedChinese]: "zh_CN",
  [PublicLanguage.Japanese]: "ja_JP",
  [PublicLanguage.Korean]: "ko_KR",
  [PublicLanguage.Russian]: "ru_RU",
  [PublicLanguage.BrazilianPortuguese]: "pt_BR",
  [PublicLanguage.Spanish]: "es_ES",
};
const DARK_TEMPLATE = '<template data-tool-theme="dark">';
const LOCALE_TEMPLATE = "<template data-tool-locale=";
const TEMPLATE_CLOSE = "</template>";
const ARTWORK_SCRIPT = '<script id="tool-initial-artwork"';
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};
const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (character) => HTML_ENTITIES[character]);
const HTML_TEXT: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};
const unescapeHtml = (value: string) =>
  value.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => HTML_TEXT[entity]);

function slice(html: string, start: string, end: string, from = 0) {
  const open = html.indexOf(start, from);
  const close = open < 0 ? -1 : html.indexOf(end, open + start.length);
  if (close < 0) throw Error(`Tool startup HTML has no ${start}…${end} section.`);
  return { open, contentStart: open + start.length, close };
}

function toolStartupRoot(html: string): { rootId: string; tool: PublicTool } {
  const rootId = Object.keys(TOOL_BY_ROOT).find((id) =>
    html.includes(`<div id="${id}" data-tool-startup-view>`),
  );
  if (!rootId) throw Error("Tool startup HTML has no prerendered tool root.");
  return { rootId, tool: TOOL_BY_ROOT[rootId] };
}

/**
 * The tools build prerenders every language into one English page: English first paint plus
 * a light and dark `<template>` per language for the saved-preference swap. A localized
 * address serves that language's markup as its own first paint, with its document language,
 * title and social text, and without the other languages' templates.
 */
export function localizedToolPage(html: string, language: PublicLanguage): string {
  if (language === PublicLanguage.English) return html;
  const { rootId, tool } = toolStartupRoot(html);
  const root = slice(html, `<div id="${rootId}" data-tool-startup-view>`, `</div>${DARK_TEMPLATE}`);
  const dark = slice(html, DARK_TEMPLATE, TEMPLATE_CLOSE, root.close);
  const artwork = html.indexOf(ARTWORK_SCRIPT, dark.close);
  const templates = html.slice(dark.close + TEMPLATE_CLOSE.length, artwork);
  if (artwork < 0 || !templates.startsWith(LOCALE_TEMPLATE))
    throw Error("Tool startup HTML has no localized templates.");
  const template = (theme: string) => {
    const section = slice(templates, `${LOCALE_TEMPLATE}"${language}-${theme}">`, TEMPLATE_CLOSE);
    return templates.slice(section.contentStart, section.close);
  };
  const body = `${html.slice(0, root.contentStart)}${template("light")}</div>${DARK_TEMPLATE}${template("dark")}${TEMPLATE_CLOSE}${html.slice(artwork)}`;
  const title = escapeHtml(translateToolText(tool.title, language));
  const description = escapeHtml(translateToolText(tool.description, language));
  const content: readonly (readonly [string, string])[] = [
    ['name="description"', description],
    ['property="og:title"', title],
    ['property="og:description"', description],
    ['property="og:locale"', OPEN_GRAPH_LOCALES[language]],
    [
      'property="og:image:alt"',
      pickText(
        language,
        "Xprite pixel art editor",
        "Xprite 像素画编辑器",
        "Xprite ドット絵エディター",
        "Xprite 도트 에디터",
        "Xprite — пиксель-арт редактор",
        "Xprite, editor de pixel art",
        "Xprite, editor de pixel art",
      ),
    ],
    ['name="twitter:title"', title],
    ['name="twitter:description"', description],
    ['name="application-name"', escapeHtml(translateToolText(tool.name, language))],
  ];
  let localized = body
    .replace(/(<html\b[^>]*\blang=)"en"/i, `$1"${language}"`)
    .replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`)
    .replace(
      new RegExp(`(<h1 id="${TOOL_HEADING_ID}"[^>]*>)[^<]*(</h1>)`),
      `$1${escapeHtml(toolHeading(tool, language))}$2`,
    )
    .replace(
      /<noscript>([^<]+)<\/noscript>/g,
      (_match, text: string) =>
        `<noscript>${escapeHtml(translateToolText(unescapeHtml(text), language))}</noscript>`,
    );
  for (const [selector, value] of content) {
    const pattern = new RegExp(`<meta\\s+${selector}\\s+content="[^"]*"\\s*\\/?>`, "i");
    if (!pattern.test(localized)) throw Error(`${tool.path} has no <meta ${selector}>.`);
    localized = localized.replace(pattern, `<meta ${selector} content="${value}" />`);
  }
  return localized;
}
