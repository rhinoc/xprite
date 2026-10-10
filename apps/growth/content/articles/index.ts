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
  datePublished?: string;
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
    title: "Edit Aseprite Files Online: 4 Browser Tools Compared | Xprite",
    shortTitle: { en: "Aseprite online", "zh-CN": "在线编辑 Aseprite" },
    description:
      "Aseprite has no web version. Xprite, Novaboard, Manabit and Pixelorama all open .aseprite in the browser. This guide compares what each keeps on import, whether it saves back to .aseprite, sign-in and offline use.",
    summary:
      "Xprite and Pixelorama save your changes back to .aseprite; Novaboard and Manabit suit drawing new animations in the browser.",
    topic: "Browser editing",
    dateModified: ARTICLE_UPDATE_DATE,
  },
  {
    collection: "compare",
    slug: "aseprite-on-ipad",
    path: "/compare/aseprite-on-ipad/",
    title: "Can You Use Aseprite on iPad? A Free Option and 3 Apps Compared | Xprite",
    shortTitle: { en: "Aseprite on iPad", "zh-CN": "iPad 上的 Aseprite" },
    description:
      "There's no Aseprite for iPad. Xprite opens .aseprite for free in Safari, keeps layers, frames and animation, and saves back to the original format. Pixquare, Resprite and Pixaki Pro add Apple Pencil double-tap, squeeze and iCloud sync. Compare price, import and export, animation and offline use.",
    summary:
      "Xprite opens and saves .aseprite for free in the browser; for Apple Pencil gestures and iCloud sync, look at Pixquare, Resprite and Pixaki Pro.",
    topic: "iPad and touch",
    dateModified: ARTICLE_UPDATE_DATE,
  },
  {
    collection: "compare",
    slug: "piskel-alternatives",
    path: "/compare/piskel-alternatives/",
    title: "Piskel Alternatives: 3 Pixel Animation Editors Compared | Xprite",
    shortTitle: { en: "Piskel alternatives", "zh-CN": "Piskel 替代工具" },
    description:
      "Piskel is good for small sprite animations. To keep editing .piskel, edit .aseprite in the browser, draw with a pen and fingers, or share your work, compare Pixelorama, Xprite and Pixilart, and learn how to move Piskel work to Xprite.",
    summary:
      "Pixelorama opens .piskel directly; Xprite suits .aseprite editing and touch drawing; Pixilart suits sharing your work.",
    topic: "Editor alternatives",
    dateModified: ARTICLE_UPDATE_DATE,
  },
  {
    collection: "learn",
    slug: "aseprite-to-gif",
    path: "/learn/aseprite-to-gif/",
    title: "Aseprite to GIF: Export an Animation in Your Browser | Xprite",
    shortTitle: { en: "Aseprite to GIF", "zh-CN": "Aseprite 转 GIF" },
    description:
      "Open an .aseprite file in the Xprite viewer, pick an animation tag, and export a GIF for free without installing Aseprite. Files stay on your device. Also covers how GIF changes frame timing, colors and transparency.",
    summary:
      "Export a whole animation or one tag as GIF in 4 steps, and see what happens to frame timing, colors and transparency.",
    topic: "Animation export",
    dateModified: ARTICLE_UPDATE_DATE,
  },
  {
    collection: "learn",
    slug: "aseprite-to-png",
    path: "/learn/aseprite-to-png/",
    title: "Aseprite to PNG: Export a Frame with a Transparent Background | Xprite",
    shortTitle: { en: "Aseprite to PNG", "zh-CN": "Aseprite 转 PNG" },
    description:
      "Open an .aseprite file in the Xprite viewer, pick a frame and visible layers, and export a transparent PNG at the canvas size for free. Files stay on your device, and you don't need Aseprite.",
    summary:
      "Export any frame as a transparent PNG in 4 steps, keeping its original size and semi-transparent pixels.",
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
