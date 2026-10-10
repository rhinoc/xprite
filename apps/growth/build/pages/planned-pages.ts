import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Marked, Renderer } from "marked";
import type { Tokens } from "marked";

import { localizedSiteHref, PublicLanguage } from "../../content/site/language.ts";
import { PLANNED_PAGES, type SitePage } from "../../content/site/pages.ts";
import { publicDesktopWindow, publicRichText } from "../public-theme.ts";
import { siteNavigationHref } from "../site-navigation.ts";
import { publicArticleClasses } from "../static-ui-renderer.ts";
import { ARTICLE_CONTENT_ROOT } from "./article-source.ts";
import { publicDocumentHtml } from "./document-page.ts";

const ESCAPED: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", '"': "&quot;" };
const escapeText = (value: string) => value.replace(/[&<"]/g, (character) => ESCAPED[character]);
const sectionId = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "");

/** Markdown written for a planned page in its language, when it exists. */
export function plannedPageSource(page: Pick<SitePage, "document" | "language">) {
  if (!page.document || !page.language) return undefined;
  const source = resolve(ARTICLE_CONTENT_ROOT, `${page.document}.${page.language}.md`);
  return existsSync(source) ? readFileSync(source, "utf8") : undefined;
}

/** A written page renders its markdown body; links stay in the page language. */
function plannedPageContent(markdown: string, page: SitePage) {
  const language = page.language!;
  const parser = new Marked({ gfm: true, async: false });
  const tokens = parser.lexer(markdown);
  const sections = new Set<string>();
  for (const token of tokens) if (token.type === "heading") sections.add(sectionId(token.text));
  parser.walkTokens(tokens, (token) => {
    if (token.type === "image") throw Error(`Planned pages do not take images: ${page.path}`);
    if (token.type !== "link") return;
    if (!/^(?:https?:\/\/|#|\/(?!\/))/i.test(token.href))
      throw Error(`Unsupported link in ${page.path}: ${token.href}`);
    if (token.href.startsWith("#") && !sections.has(decodeURIComponent(token.href.slice(1))))
      throw Error(`Broken section link in ${page.path}: ${token.href}`);
  });
  const renderer = new Renderer();
  renderer.heading = function ({ tokens: inline, depth, text }: Tokens.Heading) {
    return `<h${depth} id="${escapeText(sectionId(text))}">${this.parser.parseInline(inline)}</h${depth}>\n`;
  };
  renderer.html = ({ text }) => escapeText(text);
  renderer.link = function ({ href, tokens: inline }: Tokens.Link) {
    const target = localizedSiteHref(siteNavigationHref(href), language);
    return `<a href="${escapeText(target)}">${this.parser.parseInline(inline)}</a>`;
  };
  renderer.table = function (table: Tokens.Table) {
    return `<div class="${publicArticleClasses().tableScroll}" role="region" aria-label="${escapeText(page.title)}" tabindex="0">${Renderer.prototype.table.call(this, table)}</div>`;
  };
  parser.setOptions({ renderer });
  const introduction = tokens.find(
    (token): token is Tokens.Paragraph => token.type === "paragraph",
  );
  const description = introduction
    ? parser
        .parseInline(introduction.text)
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
    : "";
  return { html: parser.parser(tokens), description };
}

/** Planned destinations render their title, or their written body once one exists. */
export function plannedPageHtml(path: string, canonical = false): string {
  const page = PLANNED_PAGES.find((item) => item.path === path);
  if (!page || !page.language) throw Error(`Unknown planned page path: ${path}`);
  const language = page.language;
  const chinese = language === PublicLanguage.SimplifiedChinese;
  const otherLanguage = chinese ? PublicLanguage.English : PublicLanguage.SimplifiedChinese;
  const markdown = plannedPageSource(page);
  const content = markdown ? plannedPageContent(markdown, page) : undefined;
  const window = content
    ? publicDesktopWindow(
        page.title,
        `<div data-public-reader-scroll><article>${publicRichText(content.html, { "data-public-document-content": true })}</article></div>`,
        "data-public-document",
        `<a href="/editor">${chinese ? "打开编辑器" : "Open editor"}</a>`,
      )
    : publicDesktopWindow(page.title, "", "data-public-document", "", true);
  return publicDocumentHtml(
    {
      language,
      path: page.path,
      title: content ? `${page.title} | Xprite` : page.title,
      description: content?.description ?? "",
      navigation: chinese ? "网站导航" : "Website navigation",
      canonical,
    },
    false,
    `<div></div>${window}<div></div>`,
    [
      { label: chinese ? "打开编辑器" : "Open editor", href: "/" },
      {
        label: chinese ? "使用指南" : "User guide",
        href: `/help/${language}/`,
        icon: "help",
        end: true,
      },
      {
        label: chinese ? "English" : "简体中文",
        href: localizedSiteHref(page.path, otherLanguage),
        hrefLang: otherLanguage,
        icon: "language",
      },
    ],
  );
}
