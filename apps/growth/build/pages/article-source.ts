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
    throw new TypeError("Markdown images must be PNG files.");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Resolves a markdown image inside a content folder and checks the file stays in that folder. */
export function markdownImageAsset(
  directory: string,
  publicDirectory: string,
  href: string,
): ArticleImageAsset {
  if (!ARTICLE_IMAGE_HREF.test(href))
    throw new TypeError(`Markdown image path must be images/<name>.png: ${href}`);
  const contentDirectory = resolve(ARTICLE_CONTENT_ROOT, directory);
  const source = resolve(contentDirectory, href);
  if (!source.startsWith(`${contentDirectory}${sep}`))
    throw new TypeError(`Markdown image escapes its folder: ${href}`);
  const size = pngSize(readFileSync(source));
  return {
    publicPath: `/${publicDirectory}/${href}`,
    source,
    width: size.width,
    height: size.height,
  };
}

/** Resolves a markdown image next to its article. */
export function articleImageAsset(
  article: Pick<PublicArticle, "collection" | "slug">,
  href: string,
): ArticleImageAsset {
  const directory = `${article.collection}/articles`;
  return markdownImageAsset(directory, directory, href);
}
