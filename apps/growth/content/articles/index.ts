import { localizedSiteHref, PUBLIC_LANGUAGES, PublicLanguage } from "../site/language.ts";
import { SPANISH_ARTICLES, SPANISH_COLLECTIONS } from "./es.ts";
import { JAPANESE_ARTICLES, JAPANESE_COLLECTIONS } from "./ja.ts";
import { KOREAN_ARTICLES, KOREAN_COLLECTIONS } from "./ko.ts";
import { PORTUGUESE_ARTICLES, PORTUGUESE_COLLECTIONS } from "./pt-BR.ts";
import { RUSSIAN_ARTICLES, RUSSIAN_COLLECTIONS } from "./ru.ts";
import { CHINESE_ARTICLES, CHINESE_COLLECTIONS } from "./zh-CN.ts";

const ARTICLE_UPDATE_DATE = "2026-10-10";

export interface PublicArticle {
  collection: keyof typeof ARTICLE_COLLECTIONS;
  slug: string;
  path: string;
  title: string;
  shortTitle: Readonly<Record<PublicLanguage, string>>;
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
    shortTitle: {
      en: "Aseprite online",
      "zh-CN": "在线编辑 Aseprite",
      ja: "Aseprite をオンラインで",
      ko: "온라인 Aseprite",
      ru: "Aseprite онлайн",
      "pt-BR": "Aseprite online",
      es: "Aseprite online",
    },
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
    title: "Aseprite on iPad & iOS: A Free Option and 3 Apps | Xprite",
    shortTitle: {
      en: "Aseprite on iPad",
      "zh-CN": "iPad 上的 Aseprite",
      ja: "iPad で Aseprite",
      ko: "아이패드 Aseprite",
      ru: "Aseprite на iPad",
      "pt-BR": "Aseprite no iPad",
      es: "Aseprite en iPad",
    },
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
    shortTitle: {
      en: "Piskel alternatives",
      "zh-CN": "Piskel 替代工具",
      ja: "Piskel の代替",
      ko: "Piskel 대안",
      ru: "Альтернативы Piskel",
      "pt-BR": "Alternativas ao Piskel",
      es: "Alternativas a Piskel",
    },
    description:
      "Compare Piskel alternatives: Pixelorama opens .piskel, Xprite edits .aseprite in the browser with pen and touch, and Pixilart suits sharing your pixel art.",
    summary:
      "Pixelorama opens .piskel directly; Xprite suits .aseprite editing and touch drawing; Pixilart suits sharing your work.",
    topic: "Editor alternatives",
    dateModified: ARTICLE_UPDATE_DATE,
  },
];

const LOCALIZED_ARTICLES: Partial<
  Record<PublicLanguage, Readonly<Record<keyof typeof CHINESE_ARTICLES, Partial<PublicArticle>>>>
> = {
  [PublicLanguage.SimplifiedChinese]: CHINESE_ARTICLES,
  [PublicLanguage.Japanese]: JAPANESE_ARTICLES,
  [PublicLanguage.Korean]: KOREAN_ARTICLES,
  [PublicLanguage.Russian]: RUSSIAN_ARTICLES,
  [PublicLanguage.BrazilianPortuguese]: PORTUGUESE_ARTICLES,
  [PublicLanguage.Spanish]: SPANISH_ARTICLES,
};

const LOCALIZED_COLLECTIONS: Partial<
  Record<
    PublicLanguage,
    Readonly<
      Record<
        keyof typeof ARTICLE_COLLECTIONS,
        Partial<Record<"label" | "title" | "headline" | "description", string>>
      >
    >
  >
> = {
  [PublicLanguage.SimplifiedChinese]: CHINESE_COLLECTIONS,
  [PublicLanguage.Japanese]: JAPANESE_COLLECTIONS,
  [PublicLanguage.Korean]: KOREAN_COLLECTIONS,
  [PublicLanguage.Russian]: RUSSIAN_COLLECTIONS,
  [PublicLanguage.BrazilianPortuguese]: PORTUGUESE_COLLECTIONS,
  [PublicLanguage.Spanish]: SPANISH_COLLECTIONS,
};

export function localizedArticle(article: PublicArticle, language: PublicLanguage) {
  return {
    ...article,
    ...LOCALIZED_ARTICLES[language]?.[article.slug as keyof typeof CHINESE_ARTICLES],
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
    ...LOCALIZED_COLLECTIONS[language]?.[collection],
    path: localizedSiteHref(ARTICLE_COLLECTIONS[collection].path, language),
    language,
  };
}

export const ARTICLE_PATHS: readonly string[] = PUBLIC_LANGUAGES.flatMap((language) => [
  ...Object.keys(ARTICLE_COLLECTIONS).map(
    (collection) =>
      localizedCollection(collection as keyof typeof ARTICLE_COLLECTIONS, language).path,
  ),
  ...ARTICLES.map((article) => localizedArticle(article, language).path),
]);
