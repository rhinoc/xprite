import type { Plugin } from "vite";

import { VISUALLY_HIDDEN_STYLE } from "../../../../infra/site-html.ts";
import {
  editorApplicationMetadata,
  siteIdentityMetadata,
} from "../../content/application/index.ts";
import { ARTICLE_COLLECTIONS } from "../../content/articles/index.ts";
import { FEATURES_PATH } from "../../content/features/index.ts";
import { GUIDE_PAGES } from "../../content/help/pages.ts";
import { SHOWCASE_PAGES } from "../../content/showcase/pages.ts";
import {
  localizedSiteHref,
  PUBLIC_LANGUAGES,
  PublicLanguage,
} from "../../content/site/language.ts";
import { TOOLS, translateToolText, type PublicTool } from "../../content/tools/index.ts";

const SITE_URL = "https://xprite.cc/";
const SOCIAL_IMAGE_URL = new URL("social-preview.png", SITE_URL).href;
const CANONICAL_ELEMENT_PATTERN = /\s*<link\b[^>]*rel=["']canonical["'][^>]*>/gi;
const ROBOTS_ELEMENT_PATTERN = /\s*<meta\b[^>]*name=["']robots["'][^>]*>/gi;
const HEAD_CLOSE_PATTERN = /<\/head>/i;
const BODY_OPEN_PATTERN = /<body\b[^>]*>/i;
const EDITOR_HEADING = "Xprite: free online pixel art editor";
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};
const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (character) => HTML_ENTITIES[character]);

const STARTUP_COPY_CLOSE_PATTERN = /(<section class="xse-startup-copy">[\s\S]*?)(<\/section>)/;

/**
 * The editor paints only its canvas UI. Browsers without JavaScript (and the raw HTML that
 * crawlers fetch first) get a visible product summary with plain links inside the startup
 * screen. Script-enabled visitors never render `<noscript>`, so the loading screen is unchanged.
 */
function editorNoscriptSummary(): string {
  const links = [
    { href: SHOWCASE_PAGES[PublicLanguage.English].path, label: "About Xprite" },
    { href: FEATURES_PATH, label: "Features" },
    { href: GUIDE_PAGES[PublicLanguage.English].path, label: "User guide" },
    ...TOOLS.map((tool) => ({ href: tool.path, label: tool.label })),
    {
      href: ARTICLE_COLLECTIONS.compare.path,
      label: ARTICLE_COLLECTIONS.compare.headline,
    },
  ];
  const paragraphs = [
    "Xprite is a free, open-source pixel art editor and sprite animation tool that runs in your web browser. It needs JavaScript to start, so turn JavaScript on to begin drawing.",
    "Draw with pencils, fills, gradients, shapes, selections and custom brushes. Organize artwork in layers, pick colors from palettes, and animate frame by frame with tags and onion skin. Build tilemaps for game levels, record your drawing process, and export PNG images, animated GIFs and sprite sheets.",
    "Xprite opens and saves .ase and .aseprite projects, so you can keep working on Aseprite files on a computer, iPad, Android tablet or phone. Draw with a mouse, touch or a pen such as Apple Pencil, and move, resize and dock panels to arrange your own workspace. After your first online visit you can install Xprite and edit offline.",
    "Your artwork is edited and saved on your device, with no account, upload or subscription. Xprite is an independent project and is not affiliated with Aseprite or Igara Studio.",
  ];
  return `<noscript><style>#xse-startup{overflow:auto}</style>${paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("")}<p>${links
    .map((link) => `<a href="${link.href}">${escapeHtml(link.label)}</a>`)
    .join(" · ")}</p></noscript>`;
}

/** The editor is the site root, so it also carries the site and publisher entities. */
export function editorSearchMetadata(version?: string) {
  const { "@context": context, ...application } = editorApplicationMetadata(version);
  return { "@context": context, "@graph": [...siteIdentityMetadata(), application] };
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
    .replace(
      STARTUP_COPY_CLOSE_PATTERN,
      (_match, copy, close) => `${copy}${editorNoscriptSummary()}${close}`,
    );
  if (!indexable) return content;
  return content.replace(
    HEAD_CLOSE_PATTERN,
    `<script type="application/ld+json">${JSON.stringify(editorSearchMetadata(version)).replaceAll("<", "\\u003c")}</script>\n</head>`,
  );
}

/**
 * Tool pages share one address shape in every language. Each page names its own address as
 * canonical, lists every language plus the English default, and describes the application in
 * the page language.
 */
export function applyToolSearchMetadata(
  html: string,
  tool: PublicTool,
  language: PublicLanguage,
  version: string,
  indexable: boolean,
): string {
  const url = new URL(localizedSiteHref(tool.path, language), SITE_URL).href;
  const content = applyPageSearchMetadata(html, indexable).replace(
    /(<meta\s+property="og:url"\s+content=)"[^"]*"/i,
    `$1"${url}"`,
  );
  if (!indexable) return content;
  const alternates = [
    ...PUBLIC_LANGUAGES.map((value) => [value, value] as const),
    ["x-default", PublicLanguage.English] as const,
  ]
    .map(
      ([hreflang, value]) =>
        `<link rel="alternate" hreflang="${hreflang}" href="${new URL(localizedSiteHref(tool.path, value), SITE_URL).href}">`,
    )
    .join("\n");
  const application = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${url}#application`,
    name: translateToolText(tool.name, language),
    url,
    description: translateToolText(tool.description, language),
    inLanguage: language,
    image: SOCIAL_IMAGE_URL,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript and a modern web browser",
    softwareVersion: version,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };
  return content
    .replace(CANONICAL_ELEMENT_PATTERN, "")
    .replace(
      HEAD_CLOSE_PATTERN,
      `<link rel="canonical" href="${url}">\n${alternates}\n<script type="application/ld+json">${JSON.stringify(application).replaceAll("<", "\\u003c")}</script>\n</head>`,
    );
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
