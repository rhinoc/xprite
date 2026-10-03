import type { Plugin } from "vite";

const SITE_URL = "https://xprite.cc/";
const SOCIAL_IMAGE_URL = new URL("social-preview.png", SITE_URL).href;
const APPLICATION_DESCRIPTION =
  "Pixel art and animation in your browser. Open and save .ase/.aseprite projects, use touch and stylus input, and customize your workspace.";
const CANONICAL_ELEMENT_PATTERN = /\s*<link\b[^>]*rel=["']canonical["'][^>]*>/gi;

/** Only the production website participates in indexing; embeds and previews stay separate. */
export function editorSeo(version: string): Plugin {
  let indexable = false;
  return {
    name: "editor-search-metadata",
    configResolved(config) {
      indexable =
        config.command === "build" &&
        process.env.EDGEONE_ENV !== "preview" &&
        process.env.XPRITE_DISTRIBUTION !== "itch";
    },
    transformIndexHtml(html) {
      const robots = {
        tag: "meta",
        attrs: { name: "robots", content: indexable ? "index, follow" : "noindex, follow" },
        injectTo: "head" as const,
      };
      if (!indexable) return { html: html.replace(CANONICAL_ELEMENT_PATTERN, ""), tags: [robots] };
      return {
        html,
        tags: [
          robots,
          {
            tag: "script",
            attrs: { type: "application/ld+json" },
            injectTo: "head" as const,
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "@id": `${SITE_URL}#application`,
              name: "Xprite",
              url: SITE_URL,
              description: APPLICATION_DESCRIPTION,
              image: SOCIAL_IMAGE_URL,
              applicationCategory: "MultimediaApplication",
              operatingSystem: "Any",
              browserRequirements: "Requires JavaScript and a modern web browser",
              softwareVersion: version,
              isAccessibleForFree: true,
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              author: { "@type": "Person", name: "rhinoc", url: "https://github.com/rhinoc" },
              license: "https://github.com/rhinoc/xprite/blob/main/LICENSE",
              sameAs: ["https://github.com/rhinoc/xprite", "https://rhinoc.itch.io/xprite"],
            }),
          },
        ],
      };
    },
  };
}
