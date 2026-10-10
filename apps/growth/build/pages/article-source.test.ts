import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { ARTICLES } from "../../content/articles/index.ts";
import { PublicLanguage } from "../../content/site/language.ts";
import { SITE_PAGES } from "../../content/site/pages.ts";
import { pageLastModified, sitemap } from "../seo/discovery.ts";
import { articleImageAsset, readArticleDocument } from "./article-source.ts";

const ARTICLE_SLUG = "aseprite-on-ipad";
const CHINESE_PATH = "/compare/zh-CN/aseprite-on-ipad/";
const ENGLISH_PATH = "/compare/aseprite-on-ipad/";

describe("article publication dates", () => {
  const article = ARTICLES.find((item) => item.slug === ARTICLE_SLUG);
  if (!article) throw new Error(`Missing article: ${ARTICLE_SLUG}`);
  const chinese = readArticleDocument(article, PublicLanguage.SimplifiedChinese);
  const english = readArticleDocument(article, PublicLanguage.English);

  it("uses Chinese frontmatter for the updated date and sitemap", () => {
    assert.equal(chinese.dateModified, "2026-10-10");
    assert.equal(chinese.datePublished, "2026-10-10");
    assert.match(chinese.body.trimStart(), /^# /);
    assert.equal(chinese.body.includes("更新于"), false);
    const page = SITE_PAGES.find((item) => item.path === CHINESE_PATH);
    assert.equal(pageLastModified(page!), chinese.dateModified);
    assert.match(
      sitemap(),
      new RegExp(
        `<loc>https://xprite.cc${CHINESE_PATH}</loc><lastmod>${chinese.dateModified}</lastmod>`,
      ),
    );
  });

  it("keeps the registry date when an article has no frontmatter", () => {
    assert.equal(english.datePublished, undefined);
    assert.equal(english.dateModified, article.dateModified);
    const page = SITE_PAGES.find((item) => item.path === ENGLISH_PATH);
    assert.equal(pageLastModified(page!), article.dateModified);
  });

  it("publishes the comparison screenshots from the article folder", () => {
    for (const href of [
      "images/editor-with-aseprite.png",
      "images/touch-settings.png",
      "images/shortcut-toolbar.png",
      "images/save-as-browser-or-files.png",
    ]) {
      const image = articleImageAsset(article, href);
      assert.equal(image.publicPath, `/compare/articles/${href}`);
      assert.ok(image.width > 0);
      assert.ok(image.height > 0);
    }
  });
});
