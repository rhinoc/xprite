const SITE_URL = "https://xprite.cc/";
const SOCIAL_IMAGE_URL = new URL("social-preview.png", SITE_URL).href;
const ORGANIZATION_ID = `${SITE_URL}#organization`;
/** Official profiles already linked from the editor and public site. */
const SAME_AS = [
  "https://github.com/rhinoc/xprite",
  "https://rhinoc.itch.io/xprite",
  "https://x.com/rya_nooo",
  "https://ko-fi.com/rhinoc",
  "https://space.bilibili.com/32089863",
  "https://www.xiaohongshu.com/user/profile/6199f8f10000000010009efe",
] as const;
const APPLICATION_DESCRIPTION =
  "Xprite pixel editor: pixel art and animation in your browser at xprite.cc. Open and save .ase/.aseprite projects, use touch and stylus input, and customize your workspace.";
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
    name: "Xprite pixel editor",
    alternateName: ["Xprite", "Xprite Pixel Art Editor", "xprite.cc"],
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
    sameAs: [...SAME_AS],
  };
}

/** The site entity behind the editor and its public pages; `WebSite` sets the search site name. */
export function siteIdentityMetadata() {
  return [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}#website`,
      name: "Xprite pixel editor",
      alternateName: ["Xprite", "Xprite Pixel Art Editor", "xprite.cc"],
      url: SITE_URL,
      inLanguage: ["en", "zh-CN"],
      publisher: { "@id": ORGANIZATION_ID },
    },
    {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: "Xprite",
      alternateName: ["Xprite pixel editor", "xprite.cc"],
      url: SITE_URL,
      logo: new URL("icon-512.png", SITE_URL).href,
      founder: { "@type": "Person", name: "rhinoc", url: "https://github.com/rhinoc" },
      sameAs: [...SAME_AS],
    },
  ];
}
