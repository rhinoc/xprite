import type { Plugin } from "vite";

import { VISUALLY_HIDDEN_STYLE } from "../../../../infra/site-html.ts";
import { editorApplicationMetadata } from "../../content/application/index.ts";
import { ARTICLE_COLLECTIONS, ARTICLES } from "../../content/articles/index.ts";
import { FEATURES_PATH } from "../../content/features/index.ts";
import { GUIDE_PAGES } from "../../content/help/pages.ts";
import { SHOWCASE_PAGES } from "../../content/showcase/pages.ts";
import { PublicLanguage } from "../../content/site/language.ts";
import {
  GIF_SHEET_TOOL,
  ANIMAL_CROSSING_TOOL,
  PIXELATE_TOOL,
  TOOLS,
  VIEWER_TOOL,
} from "../../content/tools/index.ts";

const SITE_URL = "https://xprite.cc/";
const SOCIAL_IMAGE_URL = new URL("social-preview.png", SITE_URL).href;
const VIEWER_URL = new URL(VIEWER_TOOL.path, SITE_URL).href;
const VIEWER_DESCRIPTION = VIEWER_TOOL.description;
const CANONICAL_ELEMENT_PATTERN = /\s*<link\b[^>]*rel=["']canonical["'][^>]*>/gi;
const ROBOTS_ELEMENT_PATTERN = /\s*<meta\b[^>]*name=["']robots["'][^>]*>/gi;
const HEAD_CLOSE_PATTERN = /<\/head>/i;
const BODY_OPEN_PATTERN = /<body\b[^>]*>/i;
const BODY_CLOSE_PATTERN = /<\/body>/i;
const EDITOR_HEADING = "Xprite: free online pixel art editor";
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};
const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (character) => HTML_ENTITIES[character]);

/**
 * The editor paints only its canvas UI, so crawlers get a heading and plain links to the
 * public pages. Both are visually hidden; links leave the Tab order so keyboard focus
 * never lands on something invisible, while screen readers can still browse them.
 */
function editorDiscoveryLinks(): string {
  const links = [
    ...TOOLS.map((tool) => ({ href: tool.path, label: tool.label })),
    {
      href: ARTICLE_COLLECTIONS.compare.path,
      label: ARTICLE_COLLECTIONS.compare.headline,
    },
    ...ARTICLES.map((article) => ({ href: article.path, label: article.shortTitle.en })),
    { href: FEATURES_PATH, label: "Features" },
    { href: GUIDE_PAGES[PublicLanguage.English].path, label: "User guide" },
    { href: SHOWCASE_PAGES[PublicLanguage.English].path, label: "About Xprite" },
    {
      href: SHOWCASE_PAGES[PublicLanguage.SimplifiedChinese].path,
      label: "关于 Xprite（简体中文）",
      language: PublicLanguage.SimplifiedChinese,
    },
  ];
  return `<nav aria-label="Xprite pages" style="${VISUALLY_HIDDEN_STYLE}"><ul>${links
    .map(
      (link) =>
        `<li><a href="${link.href}" tabindex="-1"${"language" in link ? ` lang="${link.language}" hreflang="${link.language}"` : ""}>${escapeHtml(link.label)}</a></li>`,
    )
    .join("")}</ul></nav>`;
}

export function applyPageSearchMetadata(html: string, indexable: boolean): string {
  const cleaned = html.replace(ROBOTS_ELEMENT_PATTERN, "");
  const content = indexable ? cleaned : cleaned.replace(CANONICAL_ELEMENT_PATTERN, "");
  return content.replace(
    HEAD_CLOSE_PATTERN,
    `<meta name="robots" content="${indexable ? "index, follow" : "noindex, follow"}">\n</head>`,
  );
}

/** Deployment adds website SEO after assembling the independent application outputs. */
export function applyEditorSearchMetadata(
  html: string,
  version: string,
  indexable: boolean,
): string {
  const content = applyPageSearchMetadata(html, indexable)
    .replace(
      BODY_OPEN_PATTERN,
      (body) => `${body}\n<h1 style="${VISUALLY_HIDDEN_STYLE}">${EDITOR_HEADING}</h1>`,
    )
    .replace(BODY_CLOSE_PATTERN, `${editorDiscoveryLinks()}\n</body>`);
  if (!indexable) return content;
  return content.replace(
    HEAD_CLOSE_PATTERN,
    `<script type="application/ld+json">${JSON.stringify(editorApplicationMetadata(version))}</script>\n</head>`,
  );
}

function applyToolSearchMetadata(
  html: string,
  version: string,
  indexable: boolean,
  tool: { name: string; url: string; description: string },
): string {
  const content = applyPageSearchMetadata(html, indexable);
  if (!indexable) return content;
  const application = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${tool.url}#application`,
    ...tool,
    image: SOCIAL_IMAGE_URL,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript and a modern web browser",
    softwareVersion: version,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
  return content.replace(
    HEAD_CLOSE_PATTERN,
    `<script type="application/ld+json">${JSON.stringify(application)}</script>\n</head>`,
  );
}

export function applyViewerSearchMetadata(
  html: string,
  version: string,
  indexable: boolean,
): string {
  return applyToolSearchMetadata(html, version, indexable, {
    name: "Xprite Aseprite Viewer",
    url: VIEWER_URL,
    description: VIEWER_DESCRIPTION,
  });
}

export function applyGifSheetSearchMetadata(
  html: string,
  version: string,
  indexable: boolean,
): string {
  return applyToolSearchMetadata(html, version, indexable, {
    name: GIF_SHEET_TOOL.name,
    url: new URL(GIF_SHEET_TOOL.path, SITE_URL).href,
    description: GIF_SHEET_TOOL.description,
  });
}

export function applyAnimalCrossingSearchMetadata(
  html: string,
  version: string,
  indexable: boolean,
): string {
  return applyToolSearchMetadata(html, version, indexable, {
    name: ANIMAL_CROSSING_TOOL.name,
    url: new URL(ANIMAL_CROSSING_TOOL.path, SITE_URL).href,
    description: ANIMAL_CROSSING_TOOL.description,
  });
}

export function applyPixelateSearchMetadata(
  html: string,
  version: string,
  indexable: boolean,
): string {
  return applyToolSearchMetadata(html, version, indexable, {
    name: PIXELATE_TOOL.name,
    url: new URL(PIXELATE_TOOL.path, SITE_URL).href,
    description: PIXELATE_TOOL.description,
  });
}

/** Development and preview pages stay out of search results. */
export function growthSeo(): Plugin {
  let indexable = false;
  return {
    name: "growth-search-metadata",
    configResolved(config) {
      indexable = config.command === "build" && process.env.EDGEONE_ENV !== "preview";
    },
    transformIndexHtml(html) {
      return applyPageSearchMetadata(html, indexable);
    },
  };
}
