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
    title: "Aseprite on iPad / iOS: Free Online Alternative | Xprite",
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
      "Aseprite on iPad or for iOS? Open and edit .aseprite free in Safari with Xprite. No App Store install—browser editor that saves the original format.",
    summary:
      "Xprite opens and saves .aseprite for free in the browser; for Apple Pencil gestures and iCloud sync, look at Pixquare, Resprite and Pixaki Pro.",
    topic: "iPad and touch",
    dateModified: "2026-10-25",
  },
  {
    collection: "compare",
    slug: "piskel-alternatives",
    path: "/compare/piskel-alternatives/",
    title: "Piskel Alternative: Xprite vs Piskel vs Pixelorama | Xprite",
    shortTitle: {
      en: "Xprite vs Piskel",
      "zh-CN": "Xprite 与 Piskel",
      ja: "Xprite vs Piskel",
      ko: "Xprite vs Piskel",
      ru: "Xprite vs Piskel",
      "pt-BR": "Xprite vs Piskel",
      es: "Xprite vs Piskel",
    },
    description:
      "Xprite vs Piskel: both are free, open-source browser sprite editors. Xprite also opens and saves .aseprite and works on phones; Pixelorama opens .piskel.",
    summary:
      "Xprite opens and saves .aseprite and works on phones and tablets; Piskel is simpler for small desktop animations; Pixelorama opens .piskel files directly.",
    topic: "Editor alternatives",
    dateModified: ARTICLE_UPDATE_DATE,
  },
  {
    collection: "compare",
    slug: "fix-ai-pixel-art",
    path: "/compare/fix-ai-pixel-art/",
    title: "Fix AI Pixel Art: Recover the Real Grid | Xprite",
    shortTitle: {
      en: "Fix AI pixel art",
      "zh-CN": "修复 AI 像素画",
      ja: "AI ドット絵を修正",
      ko: "AI 픽셀 아트 수정",
      ru: "Исправить AI пиксель-арт",
      "pt-BR": "Corrigir pixel art de IA",
      es: "Corregir pixel art de IA",
    },
    description:
      "Fix soft or AI pixel art that sits off-grid. Snap it to a real pixel grid free in your browser, then edit in Xprite. Not magic AI—files stay on device.",
    summary:
      'Recover Grid rebuilds a true pixel lattice from soft or AI "pixel art"; it is not a generative fixer. Then edit in Xprite or download PNG.',
    topic: "Converters and grid recovery",
    dateModified: "2026-10-26",
  },
  {
    collection: "compare",
    slug: "wplace-palette",
    path: "/compare/wplace-palette/",
    title: "Wplace Palette Converter: Image → Map Colors | Xprite",
    shortTitle: {
      en: "Wplace map palette",
      "zh-CN": "Wplace map 调色板",
      ja: "Wplace map パレット",
      ko: "Wplace map 팔레트",
      ru: "Палитра Wplace map",
      "pt-BR": "Paleta Wplace map",
      es: "Paleta Wplace map",
    },
    description:
      "Free unofficial Wplace map palette converter in the browser—no upload. Match an image to Wplace map colors, export PNG for Overlays, then paint on wplace.live.",
    summary:
      "Unofficial Wplace map palette in Pixelate: match an image on-device, export PNG for a reference overlay, then paint manually on wplace.live.",
    topic: "Converters and map palettes",
    dateModified: "2026-10-29",
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
