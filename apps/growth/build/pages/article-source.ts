import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseArticleFrontmatter,
  resolveArticleDates,
  type ArticleDates,
} from "../../content/articles/frontmatter.ts";
import type { PublicArticle } from "../../content/articles/index.ts";
import { PublicLanguage } from "../../content/site/language.ts";

export const ARTICLE_CONTENT_ROOT = resolve(
  fileURLToPath(new URL("../../content/", import.meta.url)),
);
const ARTICLE_IMAGE_HREF = /^images\/[a-z0-9]+(?:-[a-z0-9]+)*\.png$/;
const PNG_SIGNATURE = "PNG";

export interface ArticleDocument extends ArticleDates {
  body: string;
}

export interface ArticleImageAsset {
  publicPath: string;
  source: string;
  width: number;
  height: number;
}

function articleMarkdownPath(
  article: Pick<PublicArticle, "collection" | "slug">,
  language: PublicLanguage,
): string {
  const suffix = language === PublicLanguage.SimplifiedChinese ? ".zh-CN" : "";
  return resolve(
    ARTICLE_CONTENT_ROOT,
    article.collection,
    "articles",
    `${article.slug}${suffix}.md`,
  );
}

export function readArticleDocument(
  article: Pick<PublicArticle, "collection" | "slug" | "dateModified">,
  language: PublicLanguage,
): ArticleDocument {
  const markdown = readFileSync(articleMarkdownPath(article, language), "utf8");
  const parsed = parseArticleFrontmatter(markdown);
  return { body: parsed.body, ...resolveArticleDates(article.dateModified, parsed.frontmatter) };
}

function pngSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 24 || bytes.toString("ascii", 1, 4) !== PNG_SIGNATURE)
    throw new TypeError("Article images must be PNG files.");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Resolves a markdown image next to its article and checks the file stays in that folder. */
export function articleImageAsset(
  article: Pick<PublicArticle, "collection" | "slug">,
  href: string,
): ArticleImageAsset {
  if (!ARTICLE_IMAGE_HREF.test(href))
    throw new TypeError(`Article image path must be images/<name>.png: ${href}`);
  const articlesDirectory = resolve(ARTICLE_CONTENT_ROOT, article.collection, "articles");
  const source = resolve(articlesDirectory, href);
  if (!source.startsWith(`${articlesDirectory}${sep}`))
    throw new TypeError(`Article image escapes its folder: ${href}`);
  const size = pngSize(readFileSync(source));
  return {
    publicPath: `/${article.collection}/articles/${href}`,
    source,
    width: size.width,
    height: size.height,
  };
}
