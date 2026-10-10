const SITE_URL = "https://xprite.cc/";
const SOCIAL_IMAGE_URL = new URL("social-preview.png", SITE_URL).href;
const APPLICATION_DESCRIPTION =
  "Pixel art and animation in your browser. Open and save .ase/.aseprite projects, use touch and stylus input, and customize your workspace.";

/** The editor and its product landing pages describe the same application. */
export function editorApplicationMetadata(version?: string) {
  return {
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
    ...(version ? { softwareVersion: version } : {}),
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: { "@type": "Person", name: "rhinoc", url: "https://github.com/rhinoc" },
    license: "https://github.com/rhinoc/xprite/blob/main/LICENSE",
    sameAs: ["https://github.com/rhinoc/xprite", "https://rhinoc.itch.io/xprite"],
  };
}
