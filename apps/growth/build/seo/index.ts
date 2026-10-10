import type { Plugin } from "vite";

import { editorApplicationMetadata } from "../../content/application/index.ts";
import {
  GIF_SHEET_TOOL,
  ANIMAL_CROSSING_TOOL,
  VIEWER_TOOL,
  TOOLS_HOME,
  DIRECTORY_TOOLS,
} from "../../content/tools/index.ts";

const SITE_URL = "https://xprite.cc/";
const SOCIAL_IMAGE_URL = new URL("social-preview.png", SITE_URL).href;
const VIEWER_URL = new URL(VIEWER_TOOL.path, SITE_URL).href;
const VIEWER_DESCRIPTION = VIEWER_TOOL.description;
const CANONICAL_ELEMENT_PATTERN = /\s*<link\b[^>]*rel=["']canonical["'][^>]*>/gi;
const ROBOTS_ELEMENT_PATTERN = /\s*<meta\b[^>]*name=["']robots["'][^>]*>/gi;
const HEAD_CLOSE_PATTERN = /<\/head>/i;

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
  const content = applyPageSearchMetadata(html, indexable);
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

export function applyToolsHomeSearchMetadata(html: string, indexable: boolean): string {
  const content = applyPageSearchMetadata(html, indexable);
  if (!indexable) return content;
  const collection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: TOOLS_HOME.name,
    url: new URL(TOOLS_HOME.path, SITE_URL).href,
    description: TOOLS_HOME.description,
    hasPart: DIRECTORY_TOOLS.map((tool) => ({
      "@type": "WebApplication",
      name: tool.name,
      url: new URL(tool.path, SITE_URL).href,
      description: tool.description,
    })),
  };
  return content.replace(
    HEAD_CLOSE_PATTERN,
    `<script type="application/ld+json">${JSON.stringify(collection)}</script>\n</head>`,
  );
}
