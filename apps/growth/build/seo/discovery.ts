import { ARTICLES, localizedArticle } from "../../content/articles/index.ts";
import { SHOWCASE_PAGES } from "../../content/showcase/pages.ts";
import { PublicLanguage } from "../../content/site/language.ts";
import { showcaseLabel } from "../../content/site/navigation.ts";
import { SITE_PAGES, SitePageKind, type SitePage } from "../../content/site/pages.ts";
import { TOOLS_HOME, ANIMAL_CROSSING_TOOL, GIF_SHEET_TOOL } from "../../content/tools/index.ts";
import { readArticleDocument } from "../pages/article-source.ts";

const SITE_URL = "https://xprite.cc/";

/** Article `updated` frontmatter wins over the shared registry date, per language. */
export function pageLastModified(page: SitePage): string | undefined {
  if (page.kind !== SitePageKind.Article || !page.language) return page.dateModified;
  const article = ARTICLES.find(
    (item) => localizedArticle(item, page.language!).path === page.path,
  );
  if (!article) return page.dateModified;
  return readArticleDocument(article, page.language).dateModified;
}

export function sitemap(): string {
  const entries = SITE_PAGES.filter((page) => page.indexable).map((page) => {
    const dateModified = pageLastModified(page);
    const translations = page.translations ?? [];
    const alternates = translations.length
      ? [...translations, { language: "x-default", path: translations[0].path }]
          .map(
            (item) =>
              `<xhtml:link rel="alternate" hreflang="${item.language}" href="${new URL(item.path, SITE_URL).href}"/>`,
          )
          .join("")
      : "";
    return `  <url><loc>${new URL(page.path, SITE_URL).href}</loc>${dateModified ? `<lastmod>${dateModified}</lastmod>` : ""}${alternates}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join("\n")}\n</urlset>\n`;
}

export function robots(indexable: boolean): string {
  return `User-agent: *\nAllow: /\n${indexable ? `Sitemap: ${SITE_URL}sitemap.xml\n` : ""}`;
}

export function languageModelIndex(): string {
  return `# Xprite

> Free browser pixel art editor and Aseprite file viewer. Open local sprite projects, edit pixels and animations, and export images.

Xprite is independent of Aseprite. File-format support is not a guarantee of complete compatibility. The viewer processes selected files on the device and exports a current PNG frame or a GIF animation. It limits file size and decoded pixels; large or unsupported projects may be rejected. Keep original project files.

## Product overview

${Object.entries(SHOWCASE_PAGES)
  .map(
    ([language, page]) =>
      `- [${showcaseLabel(language)}](${new URL(page.path, SITE_URL).href}): ${page.description}`,
  )
  .join("\n")}

## Applications

- [Pixel art editor](${SITE_URL}): Create and edit sprites, layers, and animation frames.
- [All tools](${new URL(TOOLS_HOME.path, SITE_URL).href}): Free local browser tools with no file uploads.
- [Aseprite viewer](${SITE_URL}tools/viewer/): Inspect local .ase and .aseprite files and export PNG or GIF.
- [Animal Crossing Design Converter](${new URL(ANIMAL_CROSSING_TOOL.path, SITE_URL).href}): Convert PNG images and Aseprite tilemap layers into NookLink QR codes.
- [GIF to Sprite Sheet](${new URL(GIF_SHEET_TOOL.path, SITE_URL).href}): Convert GIF frames into PNG sheets and JSON frame coordinates and timing.

## User guides

- [English guide](${SITE_URL}help/en/): Browser saving, recovery, touch controls, and offline use.
- [中文使用指南](${SITE_URL}help/zh-CN/): 浏览器保存、恢复、触摸操作与离线使用。

## File workflows and comparisons

${Object.values(PublicLanguage)
  .flatMap((language) => ARTICLES.map((article) => localizedArticle(article, language)))
  .map(
    (article) =>
      `- [${article.title}](${new URL(article.path, SITE_URL).href}): ${article.summary}`,
  )
  .join("\n")}

## Optional

- [Source repository](https://github.com/rhinoc/xprite): Source code and issue reports.
- [Sitemap](${SITE_URL}sitemap.xml): Canonical public pages.
`;
}
