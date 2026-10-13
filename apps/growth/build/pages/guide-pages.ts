import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { Marked, Renderer } from "marked";
import type { Tokens } from "marked";

import { GUIDE_PAGES } from "../../content/help/pages.ts";
import { localizedSiteHref, pickText, PUBLIC_LANGUAGES } from "../../content/site/language.ts";
import { languageSwitchLinks } from "../../content/site/navigation.ts";
import {
  publicDesktopWindow,
  publicReaderScroll,
  publicIndex,
  publicRichText,
  publicIconLink,
} from "../public-theme.ts";
import { siteNavigationHref } from "../site-navigation.ts";
import { renderPublicUi } from "../static-ui-renderer.ts";
import { publicDocumentHtml } from "./document-page.ts";

const SITE_URL = "https://xprite.cc/";
export const GUIDE_ROOT = resolve(fileURLToPath(new URL("../../content/help/", import.meta.url)));

export const GUIDES = PUBLIC_LANGUAGES.map((language) => ({
  ...GUIDE_PAGES[language],
  language,
  openEditor: pickText(
    language,
    "Open editor",
    "打开编辑器",
    "エディターを開く",
    "에디터 열기",
    "Открыть редактор",
    "Abrir editor",
    "Abrir editor",
  ),
  navigation: pickText(
    language,
    "User guide navigation",
    "使用指南导航",
    "使い方ガイドのナビゲーション",
    "사용 가이드 탐색",
    "Навигация по руководству",
    "Navegação do guia do usuário",
    "Navegación de la guía de usuario",
  ),
}));
type Guide = (typeof GUIDES)[number];
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
const headingId = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "");

export function guideImageResources(): Map<string, string> {
  const resources = new Map<string, string>();
  const catalog = JSON.parse(readFileSync(resolve(GUIDE_ROOT, "images/catalog.json"), "utf8"));
  for (const guide of GUIDES) {
    const markdown = readFileSync(resolve(GUIDE_ROOT, `README.${guide.language}.md`), "utf8");
    const parser = new Marked({ gfm: false });
    parser.walkTokens(parser.lexer(markdown), (token) => {
      if (token.type !== "image") return;
      const source = resolve(GUIDE_ROOT, token.href);
      if (
        !token.href.startsWith("images/") ||
        !source.startsWith(`${GUIDE_ROOT}${sep}`) ||
        !catalog[token.href]
      )
        throw Error(`Guide image is not catalogued: ${token.href}`);
      resources.set(`/help/${token.href}`, source);
    });
  }
  return resources;
}

export function guideHtml(guide: Guide, indexable: boolean): string {
  const markdown = readFileSync(resolve(GUIDE_ROOT, `README.${guide.language}.md`), "utf8");
  const catalog = JSON.parse(readFileSync(resolve(GUIDE_ROOT, "images/catalog.json"), "utf8"));
  const renderer = new Renderer();
  renderer.heading = function ({ tokens, depth, text }: Tokens.Heading) {
    return `<h${depth} id="${escapeHtml(headingId(text))}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
  };
  renderer.html = ({ text }) => escapeHtml(text);
  renderer.image = ({ href, text }: Tokens.Image) => {
    const dimensions = catalog[href];
    if (!dimensions) throw Error(`Guide image is not catalogued: ${href}`);
    return renderPublicUi("image", {
      src: `/help/${href}`,
      alt: text,
      width: dimensions.width,
      height: dimensions.height,
      displayWidth: dimensions.displayWidth,
    });
  };
  renderer.link = function ({ href, tokens }: Tokens.Link) {
    const text = this.parser.parseInline(tokens);
    if (!/^(?:https?:\/\/|#|\/(?!\/))/i.test(href)) throw Error(`Unsupported guide link: ${href}`);
    return `<a href="${escapeHtml(siteNavigationHref(href))}">${text}</a>`;
  };
  const parser = new Marked({ gfm: false, async: false, renderer });
  const tokens = parser.lexer(markdown);
  const firstSectionIndex = tokens.findIndex(
    (token) => token.type === "heading" && token.depth === 2,
  );
  const introduction = tokens.slice(0, firstSectionIndex);
  const contentsToken = introduction.find((token) => token.type === "list");
  const headings = new Set(
    tokens
      .filter((token): token is Tokens.Heading => token.type === "heading")
      .map((token) => headingId(token.text)),
  );
  parser.walkTokens(tokens, (token) => {
    if (
      token.type === "link" &&
      token.href.startsWith("#") &&
      !headings.has(decodeURIComponent(token.href.slice(1)))
    )
      throw Error(`Broken guide section link: ${token.href}`);
  });
  const alternates = `${GUIDES.map((item) => `<link rel="alternate" hreflang="${item.language}" href="${new URL(item.path, SITE_URL).href}">`).join("\n")}
<link rel="alternate" hreflang="x-default" href="${new URL(GUIDES[0].path, SITE_URL).href}">`;
  return publicDocumentHtml(
    guide,
    indexable,
    `<div data-public-sidebar>${publicDesktopWindow(
      pickText(
        guide.language,
        "Contents",
        "目录",
        "目次",
        "목차",
        "Содержание",
        "Conteúdo",
        "Contenido",
      ),
      publicIndex(
        guide.navigation,
        tokens
          .filter((token): token is Tokens.Heading => token.type === "heading" && token.depth === 2)
          .map((heading) => ({ href: `#${headingId(heading.text)}`, label: heading.text })),
      ),
      "data-public-contents",
    )}</div>${publicDesktopWindow(pickText(guide.language, "Xprite Help", "Xprite 使用指南", "Xprite ヘルプ", "Xprite 도움말", "Справка Xprite", "Ajuda do Xprite", "Ayuda de Xprite"), publicReaderScroll(`<article>${publicRichText(parser.parser(tokens.filter((token) => token !== contentsToken)), { "data-public-document-content": true })}</article>`, guide.language), "data-public-document", `<a href="/editor">${guide.openEditor}</a>`)}<nav data-public-shortcuts aria-label="${guide.navigation}">${publicIconLink(guide.openEditor, "/editor", "application")}${publicIconLink(pickText(guide.language, "Features", "功能", "機能", "기능", "Возможности", "Recursos", "Funciones"), localizedSiteHref("/features/", guide.language))}</nav>`,
    [
      {
        label: pickText(
          guide.language,
          "Compare",
          "工具比较",
          "比較",
          "비교",
          "Сравнение",
          "Comparar",
          "Comparar",
        ),
        href: localizedSiteHref("/compare/", guide.language),
      },
      { label: guide.openEditor, href: "/editor" },
      ...languageSwitchLinks(
        guide.language,
        Object.fromEntries(GUIDES.map((item) => [item.language, item.path])),
        true,
      ),
    ],
    alternates,
  );
}
