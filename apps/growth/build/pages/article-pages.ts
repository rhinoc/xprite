import { Marked, Renderer } from "marked";
import type { Tokens } from "marked";

import { publicDesktopStartupScript } from "../../../../infra/public-desktop-startup.ts";
import { siteIcons } from "../../../../infra/site-html.ts";
import { ARTICLE_DIAGRAM_LANGUAGE, parseArticleDiagram } from "../../content/articles/diagram.ts";
import {
  ARTICLE_COLLECTIONS,
  ARTICLES,
  localizedArticle,
  localizedCollection,
  type PublicArticle,
} from "../../content/articles/index.ts";
import { SHOWCASE_PAGES } from "../../content/showcase/pages.ts";
import { articleLanguage, localizedSiteHref, PublicLanguage } from "../../content/site/language.ts";
import { showcaseLabel } from "../../content/site/navigation.ts";
import {
  PUBLIC_THEME_ATTRIBUTES,
  PUBLIC_THEME_STYLE_PATH,
  PUBLIC_FONT_PATH,
  PUBLIC_FONT_STYLE_PATH,
  GROWTH_DESKTOP_STYLE_PATH,
  publicDesktopWindow,
  publicIconLink,
  publicPattern,
  publicDesktopNavigation,
  publicDesktopButton,
  publicIndex,
  publicRichText,
  publicUiScope,
  publicSiteFooter,
  publicStatus,
} from "../public-theme.ts";
import { siteNavigationHref } from "../site-navigation.ts";
import { publicArticleClasses, renderPublicUi } from "../static-ui-renderer.ts";
import { articleImageAsset, readArticleDocument } from "./article-source.ts";
import { GUIDE_STYLE_PATH, CHINESE_FONT_PATH } from "./document-resources.ts";

const SITE_URL = "https://xprite.cc/";
const SOCIAL_IMAGE_URL = new URL("social-preview.png", SITE_URL).href;
const pageText = (language: PublicLanguage, english: string, chinese: string) =>
  language === PublicLanguage.SimplifiedChinese ? chinese : english;
const ARTICLE_HEADING_DEPTH = 1;
const CONTENTS_HEADING_DEPTH = 2;
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export { ARTICLE_CONTENT_ROOT } from "./article-source.ts";

enum ArticleCollection {
  Compare = "compare",
  Learn = "learn",
}
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
const headingId = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
const jsonForHtml = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

function editorUrl(article?: PublicArticle): string {
  const url = new URL(SITE_URL);
  if (article?.collection === ArticleCollection.Compare) {
    url.searchParams.set("utm_source", "compare");
    url.searchParams.set("utm_medium", "referral");
    url.searchParams.set("utm_campaign", article.slug);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function articleList(
  articles: readonly (PublicArticle & { language: PublicLanguage })[],
  classes: Record<string, string>,
) {
  return `<div class="${classes.documents}">${articles
    .map((article) =>
      publicIconLink(article.shortTitle[article.language], article.path, "document"),
    )
    .join("\n")}</div>`;
}

function libraryFolders(language: PublicLanguage): string {
  const text = (en: string, zh: string) => pageText(language, en, zh);
  const href = (path: string) => localizedSiteHref(path, language);
  return publicDesktopWindow(
    "Xprite",
    `<div data-public-folder-items>${
      publicIconLink(text("Applications", "应用程序"), href("/tools/")) +
      publicIconLink(text("File guides", "文件导出指南"), href("/learn/")) +
      publicIconLink(text("Comparisons", "编辑器比较"), href("/compare/")) +
      publicIconLink(text("User guide", "使用指南"), href("/help/"), "document")
    }</div>`,
    "data-public-folders",
    text("4 items", "4 项"),
  );
}

function breadcrumbData(
  collection: ReturnType<typeof localizedCollection>,
  article?: PublicArticle,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Xprite", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: collection.label,
        item: new URL(collection.path, SITE_URL).href,
      },
      ...(article
        ? [
            {
              "@type": "ListItem",
              position: 3,
              name: article.title,
              item: new URL(article.path, SITE_URL).href,
            },
          ]
        : []),
    ],
  };
}

function articlePageHtml(
  page: Pick<PublicArticle, "title" | "description" | "path" | "collection"> & {
    language: PublicLanguage;
  },
  indexable: boolean,
  body: string,
  classes: Record<string, string>,
  article?: PublicArticle,
  headline = page.title,
): string {
  const canonical = new URL(page.path, SITE_URL).href;
  const language = page.language;
  const text = (en: string, zh: string) => pageText(language, en, zh);
  const href = (path: string) => localizedSiteHref(path, language);
  const collection = localizedCollection(page.collection, language);
  const articles = ARTICLES.map((item) => localizedArticle(item, language));
  const schema = article
    ? {
        "@context": "https://schema.org",
        "@type": "Article",
        headline,
        description: article.description,
        url: canonical,
        mainEntityOfPage: canonical,
        image: SOCIAL_IMAGE_URL,
        inLanguage: language,
        dateModified: article.dateModified,
        ...(article.datePublished ? { datePublished: article.datePublished } : {}),
        author: { "@type": "Organization", name: "Xprite", url: SITE_URL },
        publisher: { "@type": "Organization", name: "Xprite", url: SITE_URL },
      }
    : {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: page.title,
        description: page.description,
        url: canonical,
        inLanguage: language,
        hasPart: articles
          .filter((item) => item.collection === page.collection)
          .map((item) => ({
            "@type": "Article",
            name: item.title,
            url: new URL(item.path, SITE_URL).href,
          })),
      };
  return `<!doctype html>
<html lang="${language}" ${PUBLIC_THEME_ATTRIBUTES}><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<script>${publicDesktopStartupScript()}</script>
<title>${escapeHtml(page.title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<meta name="robots" content="${indexable ? "index, follow" : "noindex, follow"}">
${indexable ? `<link rel="canonical" href="${canonical}">` : ""}
${Object.values(PublicLanguage)
  .map(
    (value) =>
      `<link rel="alternate" hreflang="${value}" href="${new URL(localizedSiteHref(page.path, value), SITE_URL).href}">`,
  )
  .join("\n")}
<link rel="alternate" hreflang="x-default" href="${new URL(localizedSiteHref(page.path, PublicLanguage.English), SITE_URL).href}">
<meta property="og:type" content="${article ? "article" : "website"}">
<meta property="og:site_name" content="Xprite">
<meta property="og:title" content="${escapeHtml(page.title)}">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SOCIAL_IMAGE_URL}">
<meta property="og:image:alt" content="Xprite pixel art editor in desktop and phone browsers">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1920">
<meta property="og:image:height" content="820">
${article ? `<meta property="article:modified_time" content="${article.dateModified}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(page.title)}">
<meta name="twitter:description" content="${escapeHtml(page.description)}">
<meta name="twitter:image" content="${SOCIAL_IMAGE_URL}">
${siteIcons()}
<link rel="preload" href="${PUBLIC_FONT_PATH}?v=ec44f36e057a" as="font" type="font/woff2" crossorigin>
${language === PublicLanguage.SimplifiedChinese ? `<link rel="preload" href="${CHINESE_FONT_PATH}" as="font" type="font/woff2" crossorigin>` : ""}
<link rel="stylesheet" href="${PUBLIC_FONT_STYLE_PATH}">
<link rel="stylesheet" href="${PUBLIC_THEME_STYLE_PATH}">
<link rel="stylesheet" href="${GUIDE_STYLE_PATH}">
<link rel="stylesheet" href="${GROWTH_DESKTOP_STYLE_PATH}">
<script type="application/ld+json">${jsonForHtml(schema)}</script>
<script type="application/ld+json">${jsonForHtml(breadcrumbData(collection, article))}</script>
</head><body data-growth-desktop data-ui-desktop-pattern="${publicPattern(page.path)}">
${publicUiScope(
  `<a class="${classes.skipLink}" href="#main">${text("Skip to content", "跳到正文")}</a>
<header class="${classes.header}">${publicDesktopNavigation({
    label: text("Website navigation", "网站导航"),
    language,
    currentHref: page.path,
    brandLabel: showcaseLabel(language),
    brandHref: SHOWCASE_PAGES[language].path,
    brandImage: "/menu-icon.svg",
    links: [
      { label: text("Tools", "工具"), href: href("/tools/") },
      { label: text("Compare", "编辑器比较"), href: href("/compare/") },
      { label: text("Guides", "文件导出指南"), href: href("/learn/") },
      { label: text("Editor", "编辑器"), href: editorUrl(article) },
      { label: text("User guide", "使用指南"), href: href("/help/"), icon: "help", end: true },
      {
        label: language === PublicLanguage.English ? "简体中文" : "English",
        href: localizedSiteHref(
          page.path,
          language === PublicLanguage.English
            ? PublicLanguage.SimplifiedChinese
            : PublicLanguage.English,
        ),
        icon: "language",
      },
    ],
  })}</header>
<main id="main" data-public-desktop>${body}<nav data-public-shortcuts aria-label="${text("Desktop shortcuts", "桌面快捷入口")}">${publicIconLink(collection.label, collection.path)}</nav></main>${publicSiteFooter(language)}`,
  language,
)}
</body></html>\n`;
}

function articleImageHtml(
  article: Pick<PublicArticle, "collection" | "slug">,
  href: string,
  alt: string,
): string {
  if (!alt.trim()) throw new Error(`Article image needs alt text: ${article.slug}`);
  const image = articleImageAsset(article, href);
  return `<img src="${escapeHtml(image.publicPath)}" alt="${escapeHtml(alt)}" width="${image.width}" height="${image.height}" loading="lazy" decoding="async">`;
}

function articleContent(
  article: PublicArticle & { language: PublicLanguage },
  classes: Record<string, string>,
  markdown: string,
) {
  const language = article.language;
  const text = (en: string, zh: string) => pageText(language, en, zh);
  const renderer = new Renderer();
  const parser = new Marked({ gfm: true, async: false });
  const tokens = parser.lexer(markdown);
  const ids = new Map<Tokens.Heading, string>();
  const occurrences = new Map<string, number>();
  const headings = tokens.filter((token): token is Tokens.Heading => token.type === "heading");
  for (const heading of headings) {
    const base = headingId(heading.text);
    const count = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, count);
    ids.set(heading, count === 1 ? base : `${base}-${count}`);
  }
  const titles = headings.filter((heading) => heading.depth === ARTICLE_HEADING_DEPTH);
  if (titles.length !== 1) throw Error(`Article must contain one title: ${article.slug}`);
  const title = titles[0];
  const headingIds = new Set(ids.values());
  parser.walkTokens(tokens, (token) => {
    if (
      token.type === "link" &&
      token.href.startsWith("#") &&
      !headingIds.has(decodeURIComponent(token.href.slice(1)))
    )
      throw Error(`Broken article section link in ${article.slug}: ${token.href}`);
  });
  renderer.heading = function (heading: Tokens.Heading) {
    return `<h${heading.depth} id="${escapeHtml(ids.get(heading) ?? headingId(heading.text))}">${this.parser.parseInline(heading.tokens)}</h${heading.depth}>\n`;
  };
  renderer.html = ({ text }) => escapeHtml(text);
  renderer.image = ({ href, text: alt }: Tokens.Image) => articleImageHtml(article, href, alt);
  renderer.code = function (code: Tokens.Code) {
    if (code.lang !== ARTICLE_DIAGRAM_LANGUAGE) return Renderer.prototype.code.call(this, code);
    const diagram = parseArticleDiagram(code.text);
    return renderPublicUi("article-diagram", { diagram, language, label: diagram.label });
  };
  renderer.link = function ({ href, tokens: inlineTokens }: Tokens.Link) {
    if (!/^(?:https?:\/\/|#|\/(?!\/))/i.test(href))
      throw Error(`Unsupported article link in ${article.slug}: ${href}`);
    return `<a href="${escapeHtml(localizedSiteHref(siteNavigationHref(href), language))}">${this.parser.parseInline(inlineTokens)}</a>`;
  };
  renderer.table = function (table: Tokens.Table) {
    return `<div class="${classes.tableScroll}" role="region" aria-label="${text("File and editor comparison table", "文件与编辑器比较表")}" tabindex="0">${Renderer.prototype.table.call(this, table)}</div>`;
  };
  parser.setOptions({ renderer });
  const outline = headings.filter((heading) => heading.depth === CONTENTS_HEADING_DEPTH);
  const toc = publicDesktopWindow(
    text("Contents", "目录"),
    publicIndex(
      text("On this page", "本文内容"),
      outline.map((heading) => ({ href: `#${ids.get(heading)!}`, label: heading.text })),
    ),
    "data-public-contents",
    text(`${outline.length} sections`, `${outline.length} 个章节`),
  );
  return {
    heading: parser.parser([title]),
    headline: title.text,
    html: parser.parser(tokens.filter((token) => token !== title)),
    toc,
  };
}

/** Only reviewed manifest entries render; research and drafts have no public routes. */
export function articleHtml(path: string, indexable: boolean): string {
  const classes = publicArticleClasses();
  const language = articleLanguage(path);
  const text = (en: string, zh: string) => pageText(language, en, zh);
  const collections = Object.keys(ARTICLE_COLLECTIONS).map((key) =>
    localizedCollection(key as keyof typeof ARTICLE_COLLECTIONS, language),
  );
  const articles = ARTICLES.map((article) => localizedArticle(article, language));
  const collection = collections.find((item) => item.path === path);
  if (collection) {
    const documents = articles.filter((item) => item.collection === collection.collection);
    return articlePageHtml(
      collection,
      indexable,
      `<div data-public-sidebar>${libraryFolders(language)}</div>${publicDesktopWindow(
        collection.label,
        articleList(documents, classes),
        `class="${classes.directory}" data-public-document data-public-directory-window`,
        `<span>${text(`${documents.length} documents`, `${documents.length} 篇文档`)}</span><a href="/editor">${text("Open Xprite", "打开 Xprite")}</a>`,
        true,
      )}`,
      classes,
    );
  }
  const article = articles.find((item) => item.path === path);
  if (!article) throw Error(`Unknown article path: ${path}`);
  const document = readArticleDocument(article, language);
  const publishedArticle = {
    ...article,
    dateModified: document.dateModified,
    ...(document.datePublished ? { datePublished: document.datePublished } : {}),
  };
  const parent = localizedCollection(article.collection, language);
  const content = articleContent(publishedArticle, classes, document.body);
  const learning = article.collection === ArticleCollection.Learn;
  const callout = learning
    ? {
        url: localizedSiteHref("/tools/viewer/", language),
        label: text("Open viewer", "打开查看器"),
      }
    : {
        url: editorUrl(article),
        label: text("Open Xprite", "打开 Xprite"),
      };
  const relatedDocuments = articles.filter((item) => item.slug !== article.slug);
  return articlePageHtml(
    article,
    indexable,
    `<div data-public-sidebar>${content.toc}</div><div class="${classes.readingStack}">${publicDesktopWindow(`${article.topic}.txt`, `${publicStatus(parent.label, `${text("Updated", "更新")}: ${publishedArticle.dateModified}`, parent.path)}<div data-public-reader-scroll><article class="${classes.article}">${publicRichText(content.heading + content.html, { "data-public-document-content": true })}</article></div>`, "data-public-document", `<a href="${parent.path}">${text(`Back to ${parent.label}`, `返回${parent.label}`)}</a>${publicDesktopButton(callout.url, callout.label)}`)}${publicDesktopWindow(
      text("Related documents", "相关文档"),
      articleList(relatedDocuments, classes),
      `class="${classes.related}" data-public-related-window`,
      text(`${relatedDocuments.length} documents`, `${relatedDocuments.length} 篇文档`),
    )}</div>`,
    classes,
    publishedArticle,
    content.headline,
  );
}

/** Copies markdown images into the public site next to their article collection. */
export function articleImageResources(): Map<string, string> {
  const resources = new Map<string, string>();
  for (const article of ARTICLES) {
    for (const language of Object.values(PublicLanguage)) {
      const document = readArticleDocument(article, language);
      const parser = new Marked({ gfm: true, async: false });
      parser.walkTokens(parser.lexer(document.body), (token) => {
        if (token.type !== "image") return;
        const image = articleImageAsset(article, token.href);
        resources.set(image.publicPath, image.source);
      });
    }
  }
  return resources;
}
