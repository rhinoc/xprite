import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { Marked, Renderer } from "marked";
import type { Tokens } from "marked";

import { ARTICLE_DIAGRAM_LANGUAGE, parseArticleDiagram } from "../../content/articles/diagram.ts";
import { GUIDE_PAGES } from "../../content/help/pages.ts";
import { localizedSiteHref, PublicLanguage } from "../../content/site/language.ts";
import { DOCUMENT_PAGES, type SitePage } from "../../content/site/pages.ts";
import { publicDesktopWindow, publicRichText } from "../public-theme.ts";
import { siteNavigationHref } from "../site-navigation.ts";
import { publicArticleClasses, renderPublicUi } from "../static-ui-renderer.ts";
import { ARTICLE_CONTENT_ROOT, markdownImageAsset } from "./article-source.ts";
import { publicDocumentHtml } from "./document-page.ts";

const SITE_URL = "https://xprite.cc/";
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const ESCAPED: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", '"': "&quot;" };
const escapeText = (value: string) => value.replace(/[&<"]/g, (character) => ESCAPED[character]);
const sectionId = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
/** A paragraph that only links to a sibling Markdown file is repository navigation. */
const REPOSITORY_LANGUAGE_LINK = /^\[[^\]]+\]\([^/:)]+\.md\)$/;
/** Dates are metadata, not a summary. */
const DATE_PARAGRAPH = /^(?:Last updated|更新日期)/;

/** Absolute path of a document page's Markdown source. */
export function documentSourcePath(page: Pick<SitePage, "document" | "path">) {
  if (!page.document) throw Error(`Document page has no source: ${page.path}`);
  return resolve(REPOSITORY_ROOT, page.document);
}

/** Markdown written for a document page. */
export function documentSource(page: Pick<SitePage, "document" | "path">) {
  return readFileSync(documentSourcePath(page), "utf8");
}

/** Images sit in an images folder beside the page markdown, e.g. content/about/images. */
function documentImage(page: Pick<SitePage, "document" | "path">, href: string) {
  const directory = relative(ARTICLE_CONTENT_ROOT, dirname(documentSourcePath(page)));
  if (directory.startsWith("..") || directory.includes(`..${sep}`))
    throw Error(`Only documents under apps/growth/content can use images: ${page.path}`);
  return markdownImageAsset(directory, directory, href);
}

/** Copies images used by document pages into the public site. */
export function documentImageResources(): Map<string, string> {
  const resources = new Map<string, string>();
  for (const page of DOCUMENT_PAGES) {
    const parser = new Marked({ gfm: true, async: false });
    parser.walkTokens(parser.lexer(documentSource(page)), (token) => {
      if (token.type !== "image") return;
      const image = documentImage(page, token.href);
      resources.set(image.publicPath, image.source);
    });
  }
  return resources;
}

/** Renders a document body; links stay in the page language. */
export function documentContent(markdown: string, page: SitePage) {
  const language = page.language!;
  const parser = new Marked({ gfm: true, async: false });
  const tokens = parser
    .lexer(markdown)
    .filter(
      (token) => token.type !== "paragraph" || !REPOSITORY_LANGUAGE_LINK.test(token.text.trim()),
    );
  const sections = new Set<string>();
  for (const token of tokens) if (token.type === "heading") sections.add(sectionId(token.text));
  parser.walkTokens(tokens, (token) => {
    if (token.type === "image") {
      if (!token.text.trim()) throw Error(`Document image needs alt text: ${page.path}`);
      documentImage(page, token.href);
    }
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
  renderer.image = ({ href, text: alt }: Tokens.Image) => {
    const image = documentImage(page, href);
    return `<img src="${escapeText(image.publicPath)}" alt="${escapeText(alt)}" width="${image.width}" height="${image.height}" loading="lazy" decoding="async">`;
  };
  renderer.code = function (code: Tokens.Code) {
    if (code.lang !== ARTICLE_DIAGRAM_LANGUAGE) return Renderer.prototype.code.call(this, code);
    const diagram = parseArticleDiagram(code.text);
    return renderPublicUi("article-diagram", { diagram, language, label: diagram.label });
  };
  renderer.link = function ({ href, tokens: inline }: Tokens.Link) {
    const target = localizedSiteHref(siteNavigationHref(href), language);
    return `<a href="${escapeText(target)}">${this.parser.parseInline(inline)}</a>`;
  };
  renderer.table = function (table: Tokens.Table) {
    return `<div class="${publicArticleClasses().tableScroll}" role="region" aria-label="${escapeText(page.title)}" tabindex="0">${Renderer.prototype.table.call(this, table)}</div>`;
  };
  parser.setOptions({ renderer });
  const introduction = tokens.find(
    (token): token is Tokens.Paragraph =>
      token.type === "paragraph" && !DATE_PARAGRAPH.test(token.text.trim()),
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

/** A written document such as the privacy notice or an about-page article. */
export function documentHtml(path: string, indexable: boolean): string {
  const page = DOCUMENT_PAGES.find((item) => item.path === path);
  if (!page || !page.language) throw Error(`Unknown document path: ${path}`);
  const language = page.language;
  const chinese = language === PublicLanguage.SimplifiedChinese;
  const content = documentContent(documentSource(page), page);
  const translations = page.translations ?? [];
  const other = translations.find((item) => item.language !== language);
  const english = translations.find((item) => item.language === PublicLanguage.English);
  const alternates = other
    ? `${translations.map((item) => `<link rel="alternate" hreflang="${item.language}" href="${new URL(item.path, SITE_URL).href}">`).join("\n")}
${english ? `<link rel="alternate" hreflang="x-default" href="${new URL(english.path, SITE_URL).href}">` : ""}`
    : "";
  return publicDocumentHtml(
    {
      language,
      path: page.path,
      title: page.title.includes("Xprite") ? page.title : `${page.title} | Xprite`,
      description: content.description,
      navigation: chinese ? "网站导航" : "Website navigation",
    },
    indexable,
    `<div></div>${publicDesktopWindow(
      page.title,
      `<div data-public-reader-scroll><article>${publicRichText(content.html, { "data-public-document-content": true })}</article></div>`,
      "data-public-document",
      `<a href="/editor">${chinese ? "打开编辑器" : "Open editor"}</a>`,
    )}<div></div>`,
    [
      { label: chinese ? "打开编辑器" : "Open editor", href: "/" },
      {
        label: chinese ? "使用指南" : "User guide",
        href: GUIDE_PAGES[language].path,
        icon: "help",
        end: true,
      },
      ...(other
        ? [
            {
              label: chinese ? "English" : "简体中文",
              href: other.path,
              hrefLang: other.language,
              icon: "language" as const,
            },
          ]
        : []),
    ],
    alternates,
  );
}
