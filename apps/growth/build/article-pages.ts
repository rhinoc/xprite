import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { transform } from "lightningcss";
import { Marked, Renderer } from "marked";
import type { Tokens } from "marked";

import { publicDesktopStartupScript } from "../../../infra/public-desktop-startup.ts";
import { siteIcons } from "../../../infra/site-html.ts";
import { ARTICLE_COLLECTIONS, ARTICLES, type PublicArticle } from "../content/articles/index.ts";
import { SHOWCASE_PAGES } from "../src/managers/showcase/showcase-pages.ts";
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
  publicStatus,
} from "./public-theme.ts";
import { siteNavigationHref } from "./site-navigation.ts";

const SITE_URL = "https://xprite.cc/";
const SOCIAL_IMAGE_URL = new URL("social-preview.png", SITE_URL).href;
const GUIDE_STYLE_PATH = "/help/guide.css";
const CONTENT_LANGUAGE = "en";
const ARTICLE_HEADING_DEPTH = 1;
const CONTENTS_HEADING_DEPTH = 2;
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const ARTICLE_CONTENT_ROOT = resolve(fileURLToPath(new URL("../content/", import.meta.url)));
export const ARTICLE_STYLE_PATH = "/compare/site.css";

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

function articleStyles() {
  const result = transform({
    filename: resolve(ARTICLE_CONTENT_ROOT, "compare/site.module.css"),
    code: Buffer.from(
      readFileSync(resolve(ARTICLE_CONTENT_ROOT, "compare/site.module.css"), "utf8"),
    ),
    cssModules: { pattern: "compare_[local]" },
    minify: true,
  });
  const classes = Object.fromEntries(
    Object.entries(result.exports ?? {}).map(([name, item]) => [name, item.name]),
  );
  return { css: result.code.toString(), classes };
}

/** CSS Modules are compiled for static HTML, without a browser JavaScript bundle. */
export function articleStylesheet(): string {
  return articleStyles().css;
}

function editorUrl(article?: PublicArticle): string {
  const url = new URL(SITE_URL);
  if (article?.collection === ArticleCollection.Compare) {
    url.searchParams.set("utm_source", "compare");
    url.searchParams.set("utm_medium", "referral");
    url.searchParams.set("utm_campaign", article.slug);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function articleList(articles: readonly PublicArticle[], classes: Record<string, string>) {
  return `<div class="${classes.documents}">${articles
    .map((article) => publicIconLink(article.title.split(":")[0], article.path, "document"))
    .join("\n")}</div>`;
}

function libraryFolders(): string {
  return publicDesktopWindow(
    "Xprite",
    `<div data-public-folder-items>${
      publicIconLink("Applications", "/tools/") +
      publicIconLink("File guides", "/learn/") +
      publicIconLink("Comparisons", "/compare/") +
      publicIconLink("User guide", "/help/en/", "document")
    }</div>`,
    "data-public-folders",
    "4 items",
  );
}

function breadcrumbData(
  collection: (typeof ARTICLE_COLLECTIONS)[ArticleCollection],
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
  page: Pick<PublicArticle, "title" | "description" | "path" | "collection">,
  indexable: boolean,
  body: string,
  classes: Record<string, string>,
  article?: PublicArticle,
  headline = page.title,
): string {
  const canonical = new URL(page.path, SITE_URL).href;
  const collection = ARTICLE_COLLECTIONS[page.collection];
  const schema = article
    ? {
        "@context": "https://schema.org",
        "@type": "Article",
        headline,
        description: article.description,
        url: canonical,
        mainEntityOfPage: canonical,
        image: SOCIAL_IMAGE_URL,
        inLanguage: CONTENT_LANGUAGE,
        dateModified: article.dateModified,
        author: { "@type": "Organization", name: "Xprite", url: SITE_URL },
        publisher: { "@type": "Organization", name: "Xprite", url: SITE_URL },
      }
    : {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: page.title,
        description: page.description,
        url: canonical,
        inLanguage: CONTENT_LANGUAGE,
        hasPart: ARTICLES.filter((item) => item.collection === page.collection).map((item) => ({
          "@type": "Article",
          name: item.title,
          url: new URL(item.path, SITE_URL).href,
        })),
      };
  return `<!doctype html>
<html lang="${CONTENT_LANGUAGE}" ${PUBLIC_THEME_ATTRIBUTES}><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<script>${publicDesktopStartupScript()}</script>
<title>${escapeHtml(page.title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<meta name="robots" content="${indexable ? "index, follow" : "noindex, follow"}">
${indexable ? `<link rel="canonical" href="${canonical}">` : ""}
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
<link rel="stylesheet" href="${PUBLIC_FONT_STYLE_PATH}">
<link rel="stylesheet" href="${PUBLIC_THEME_STYLE_PATH}">
<link rel="stylesheet" href="${GUIDE_STYLE_PATH}">
<link rel="stylesheet" href="${ARTICLE_STYLE_PATH}">
<link rel="stylesheet" href="${GROWTH_DESKTOP_STYLE_PATH}">
<script type="application/ld+json">${jsonForHtml(schema)}</script>
<script type="application/ld+json">${jsonForHtml(breadcrumbData(collection, article))}</script>
</head><body data-growth-desktop data-ui-desktop-pattern="${publicPattern(page.path)}">
${publicUiScope(`<a class="${classes.skipLink}" href="#main">Skip to content</a>
<header class="${classes.header}">${publicDesktopNavigation({
  label: "Website navigation",
  currentHref: page.path,
  brandLabel: "Xprite showcase",
  brandHref: SHOWCASE_PAGES[CONTENT_LANGUAGE].path,
  brandImage: "/menu-icon.svg",
  links: [
    { label: "Tools", href: "/tools/" },
    { label: "Compare", href: "/compare/" },
    { label: "Guides", href: "/learn/" },
    { label: "Editor", href: editorUrl(article) },
    { label: "User guide", href: "/help/en/", icon: "help", end: true },
  ],
})}</header>
<main id="main" data-public-desktop>${body}<nav data-public-shortcuts aria-label="Desktop shortcuts">${publicIconLink(collection.label, collection.path)}</nav></main>`)}
</body></html>\n`;
}

function articleContent(article: PublicArticle, classes: Record<string, string>) {
  const markdown = readFileSync(
    resolve(ARTICLE_CONTENT_ROOT, article.collection, "articles", `${article.slug}.md`),
    "utf8",
  );
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
  renderer.link = function ({ href, tokens: inlineTokens }: Tokens.Link) {
    if (!/^(?:https?:\/\/|#|\/(?!\/))/i.test(href))
      throw Error(`Unsupported article link in ${article.slug}: ${href}`);
    return `<a href="${escapeHtml(siteNavigationHref(href))}">${this.parser.parseInline(inlineTokens)}</a>`;
  };
  renderer.table = function (table: Tokens.Table) {
    return `<div class="${classes.tableScroll}" role="region" aria-label="File and editor comparison table" tabindex="0">${Renderer.prototype.table.call(this, table)}</div>`;
  };
  parser.setOptions({ renderer });
  const outline = headings.filter((heading) => heading.depth === CONTENTS_HEADING_DEPTH);
  const toc = publicDesktopWindow(
    "Contents",
    publicIndex(
      "On this page",
      outline.map((heading) => ({ href: `#${ids.get(heading)!}`, label: heading.text })),
    ),
    "data-public-contents",
    `${outline.length} sections`,
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
  const { classes } = articleStyles();
  const collection = Object.values(ARTICLE_COLLECTIONS).find((item) => item.path === path);
  if (collection) {
    return articlePageHtml(
      collection,
      indexable,
      `<div data-public-sidebar>${libraryFolders()}</div>${publicDesktopWindow(
        collection.label,
        `${publicStatus(`${ARTICLES.filter((item) => item.collection === collection.collection).length} documents`, "Icon view")}${articleList(
          ARTICLES.filter((item) => item.collection === collection.collection),
          classes,
        )}`,
        `class="${classes.directory}" data-public-document data-public-directory-window`,
        `<a href="/editor">Open Xprite</a><span>Xprite Library</span>`,
        true,
      )}`,
      classes,
    );
  }
  const article = ARTICLES.find((item) => item.path === path);
  if (!article) throw Error(`Unknown article path: ${path}`);
  const parent = ARTICLE_COLLECTIONS[article.collection];
  const content = articleContent(article, classes);
  const learning = article.collection === ArticleCollection.Learn;
  const callout = learning
    ? {
        url: "/tools/viewer/",
        label: "Open free viewer",
      }
    : {
        url: editorUrl(article),
        label: "Open Xprite",
      };
  return articlePageHtml(
    article,
    indexable,
    `<div data-public-sidebar>${content.toc}</div><div class="${classes.readingStack}">${publicDesktopWindow(`${article.topic}.txt`, `${publicStatus(parent.label, `${learning ? "Updated" : "Checked"}: ${article.dateModified}`, parent.path)}<div data-public-reader-scroll><article class="${classes.article}">${publicRichText(content.heading + content.html, { "data-public-document-content": true })}</article></div>`, "data-public-document", `<a href="${parent.path}">Back to ${parent.label}</a>${publicDesktopButton(callout.url, callout.label)}`)}${publicDesktopWindow(
      "Related documents",
      articleList(
        ARTICLES.filter((item) => item.slug !== article.slug),
        classes,
      ),
      `class="${classes.related}" data-public-related-window`,
      "Xprite Library",
    )}</div>`,
    classes,
    article,
    content.headline,
  );
}
