const SITE_URL = "https://xprite.cc/";
const SOCIAL_IMAGE_URL = new URL("social-preview.png", SITE_URL).href;
const ORGANIZATION_ID = `${SITE_URL}#organization`;
const APPLICATION_DESCRIPTION =
  "Pixel art and animation in your browser. Open and save .ase/.aseprite projects, use touch and stylus input, and customize your workspace.";
/** Core capabilities stated in the README, the landing-page FAQ and the user guide. */
const APPLICATION_FEATURES = [
  "Pixel art drawing",
  "Frame-by-frame animation",
  "Aseprite .ase/.aseprite import",
  "GIF and PNG export",
];

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
    featureList: APPLICATION_FEATURES,
    author: { "@type": "Person", name: "rhinoc", url: "https://github.com/rhinoc" },
    publisher: { "@id": ORGANIZATION_ID },
    license: "https://github.com/rhinoc/xprite/blob/main/LICENSE",
    sameAs: ["https://github.com/rhinoc/xprite", "https://rhinoc.itch.io/xprite"],
  };
}

/** The site entity behind the editor and its public pages; `WebSite` sets the search site name. */
export function siteIdentityMetadata() {
  return [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}#website`,
      name: "Xprite",
      alternateName: ["Xprite Pixel Art Editor", "xprite.cc"],
      url: SITE_URL,
      inLanguage: ["en", "zh-CN"],
      publisher: { "@id": ORGANIZATION_ID },
    },
    {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: "Xprite",
      url: SITE_URL,
      logo: new URL("icon-512.png", SITE_URL).href,
      founder: { "@type": "Person", name: "rhinoc", url: "https://github.com/rhinoc" },
      sameAs: ["https://github.com/rhinoc/xprite", "https://rhinoc.itch.io/xprite"],
    },
  ];
}
