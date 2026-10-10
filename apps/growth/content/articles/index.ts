import { localizedSiteHref, PublicLanguage } from "../site/language.ts";
import { CHINESE_ARTICLES, CHINESE_COLLECTIONS } from "./zh-CN.ts";

const ARTICLE_UPDATE_DATE = "2026-10-10";

export interface PublicArticle {
  collection: keyof typeof ARTICLE_COLLECTIONS;
  slug: string;
  path: string;
  title: string;
  shortTitle: Readonly<Record<"en" | "zh-CN", string>>;
  description: string;
  summary: string;
  topic: string;
  dateModified: string;
}

export const ARTICLE_COLLECTIONS = {
  compare: {
    collection: "compare",
    path: "/compare/",
    label: "Compare",
    title: "Compare Pixel Art Editors | Xprite",
    headline: "Pixel art editor comparison",
    description:
      "Choose a pixel art editor for your browser or iPad. Compare Aseprite, Piskel, Xprite, and tablet apps by animation, file formats, and input.",
  },
  learn: {
    collection: "learn",
    path: "/learn/",
    label: "File guides",
    title: "Aseprite File Guides: PNG and GIF Export | Xprite",
    headline: "Aseprite file guides",
    description:
      "Open an Aseprite project in your browser and export a PNG frame or GIF animation for free. Check transparency, timing, and file-size limits.",
  },
} as const;

export const ARTICLES: readonly PublicArticle[] = [
  {
    collection: "compare",
    slug: "aseprite-online",
    path: "/compare/aseprite-online/",
    title: "Aseprite Online",
    shortTitle: { en: "Aseprite online", "zh-CN": "在线编辑 Aseprite" },
    description:
      "Open an existing Aseprite sprite in your browser. Compare Xprite, Novaboard, Manabit, and Pixelorama by import, editing, and the file you need afterward.",
    summary:
      "Choose a browser tool by the sprite you have and the editable project, image, or animation you need afterward.",
    topic: "Browser editing",
    dateModified: ARTICLE_UPDATE_DATE,
  },
  {
    collection: "compare",
    slug: "aseprite-on-ipad",
    path: "/compare/aseprite-on-ipad/",
    title: "Aseprite on iPad",
    shortTitle: { en: "Aseprite on iPad", "zh-CN": "iPad 像素编辑工具" },
    description:
      "Looking for Aseprite on iPad? Compare native pixel art apps and browser editors by Apple Pencil input, animation, and .aseprite project compatibility.",
    summary:
      "Compare native iPad apps and browser workflows for Pencil input, animation, and moving projects between devices.",
    topic: "iPad and touch",
    dateModified: ARTICLE_UPDATE_DATE,
  },
  {
    collection: "compare",
    slug: "piskel-alternatives",
    path: "/compare/piskel-alternatives/",
    title: "Piskel Alternatives",
    shortTitle: { en: "Piskel alternatives", "zh-CN": "Piskel 替代工具" },
    description:
      "Compare Piskel alternatives for browser pixel art, sprite animation, offline work, and Aseprite files. Choose by your next project and required output.",
    summary:
      "Choose a next editor based on the files you use, the animation you make, and whether you need browser or desktop work.",
    topic: "Editor alternatives",
    dateModified: ARTICLE_UPDATE_DATE,
  },
  {
    collection: "learn",
    slug: "aseprite-to-gif",
    path: "/learn/aseprite-to-gif/",
    title: "Aseprite to GIF",
    shortTitle: { en: "Aseprite to GIF", "zh-CN": "Aseprite 转 GIF" },
    description:
      "Convert an Aseprite animation to GIF free in your browser. Choose a tag, check frame timing and transparency, and download. Files are processed locally.",
    summary:
      "Export a whole animation or one tag as GIF, and check colors, transparency and timing before sharing.",
    topic: "Animation export",
    dateModified: ARTICLE_UPDATE_DATE,
  },
  {
    collection: "learn",
    slug: "aseprite-to-png",
    path: "/learn/aseprite-to-png/",
    title: "Aseprite to PNG",
    shortTitle: { en: "Aseprite to PNG", "zh-CN": "Aseprite 转 PNG" },
    description:
      "Convert an Aseprite file to a transparent PNG frame free online. Pick a frame and visible layers, keep original dimensions, and download locally.",
    summary:
      "Choose a frame and visible layers, then download a transparent PNG at the project's original dimensions.",
    topic: "Transparent images",
    dateModified: ARTICLE_UPDATE_DATE,
  },
];

export function localizedArticle(article: PublicArticle, language: PublicLanguage) {
  return {
    ...article,
    ...(language === PublicLanguage.SimplifiedChinese
      ? CHINESE_ARTICLES[article.slug as keyof typeof CHINESE_ARTICLES]
      : {}),
    path: localizedSiteHref(article.path, language),
    language,
  };
}

export function localizedCollection(
  collection: keyof typeof ARTICLE_COLLECTIONS,
  language: PublicLanguage,
) {
  return {
    ...ARTICLE_COLLECTIONS[collection],
    ...(language === PublicLanguage.SimplifiedChinese ? CHINESE_COLLECTIONS[collection] : {}),
    path: localizedSiteHref(ARTICLE_COLLECTIONS[collection].path, language),
    language,
  };
}

export const ARTICLE_PATHS: readonly string[] = Object.values(PublicLanguage).flatMap(
  (language) => [
    ...Object.keys(ARTICLE_COLLECTIONS).map(
      (collection) =>
        localizedCollection(collection as keyof typeof ARTICLE_COLLECTIONS, language).path,
    ),
    ...ARTICLES.map((article) => localizedArticle(article, language).path),
  ],
);
