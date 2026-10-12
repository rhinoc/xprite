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
