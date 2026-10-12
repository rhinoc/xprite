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
} as const;

export const ARTICLES: readonly PublicArticle[] = [
  {
    collection: "compare",
    slug: "aseprite-online",
    path: "/compare/aseprite-online/",
    title: "Edit Aseprite Files Online: 4 Browser Tools Compared | Xprite",
    shortTitle: { en: "Aseprite online", "zh-CN": "在线编辑 Aseprite" },
    description:
      "Aseprite has no web version. Compare Xprite, Novaboard, Manabit and Pixelorama for opening .aseprite online: import, saving back, sign-in and offline use.",
    summary:
      "Xprite and Pixelorama save your changes back to .aseprite; Novaboard and Manabit suit drawing new animations in the browser.",
    topic: "Browser editing",
    dateModified: ARTICLE_UPDATE_DATE,
  },
  {
    collection: "compare",
    slug: "aseprite-on-ipad",
    path: "/compare/aseprite-on-ipad/",
    title: "Aseprite on iPad & iOS: A Free Option and 3 Apps Compared | Xprite",
    shortTitle: { en: "Aseprite on iPad", "zh-CN": "iPad 上的 Aseprite" },
    description:
      "No Aseprite for iPad or iOS? Xprite opens and saves .aseprite free in Safari. Pixquare, Resprite and Pixaki Pro add Apple Pencil gestures and iCloud sync.",
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
      "Compare Piskel alternatives: Pixelorama opens .piskel, Xprite edits .aseprite in the browser with pen and touch, and Pixilart suits sharing your pixel art.",
    summary:
      "Pixelorama opens .piskel directly; Xprite suits .aseprite editing and touch drawing; Pixilart suits sharing your work.",
    topic: "Editor alternatives",
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
