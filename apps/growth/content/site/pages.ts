import {
  ARTICLES,
  ARTICLE_COLLECTIONS,
  localizedArticle,
  localizedCollection,
} from "../articles/index.ts";
import { GUIDE_PAGES } from "../help/pages.ts";
import { SHOWCASE_PAGES } from "../showcase/pages.ts";
import { EDITOR_TOOL, TOOLS, TOOLS_HOME } from "../tools/index.ts";
import { documentTranslations, SITE_DOCUMENTS } from "./documents.ts";
import { PublicLanguage } from "./language.ts";

export enum SitePageKind {
  Editor = "editor",
  Tool = "tool",
  /** The about page: the website home built from the showcase application. */
  Showcase = "showcase",
  Guide = "guide",
  Article = "article",
  /** A Markdown body such as the privacy notice; see `SITE_DOCUMENTS`. */
  Document = "document",
}

export interface SitePage {
  kind: SitePageKind;
  path: string;
  language?: PublicLanguage;
  title: string;
  description?: string;
  dateModified?: string;
  /** Markdown source relative to the repository root, for document pages. */
  document?: string;
  indexable: boolean;
  translations?: readonly { language: PublicLanguage; path: string }[];
}

const PUBLIC_LANGUAGES = Object.values(PublicLanguage);

/** Documents publish only the languages they are written in. */
export const DOCUMENT_PAGES: readonly SitePage[] = SITE_DOCUMENTS.flatMap((document) => {
  const translations = documentTranslations(document);
  return translations.map(({ language, path }) => ({
    kind: SitePageKind.Document,
    path,
    language,
    title: document.title[language]!,
    document: document.sources[language],
    indexable: true,
    translations,
  }));
});

const localizedPublishedPages: readonly SitePage[] = PUBLIC_LANGUAGES.flatMap((language) => [
  {
    ...SHOWCASE_PAGES[language],
    kind: SitePageKind.Showcase,
    language,
    indexable: true,
    translations: PUBLIC_LANGUAGES.map((language) => ({
      language,
      path: SHOWCASE_PAGES[language].path,
    })),
  },
  {
    ...GUIDE_PAGES[language],
    kind: SitePageKind.Guide,
    language,
    indexable: true,
    translations: PUBLIC_LANGUAGES.map((language) => ({
      language,
      path: GUIDE_PAGES[language].path,
    })),
  },
  ...Object.keys(ARTICLE_COLLECTIONS).map((collection) => {
    const name = collection as keyof typeof ARTICLE_COLLECTIONS;
    const page = localizedCollection(name, language);
    return {
      kind: SitePageKind.Article,
      path: page.path,
      language,
      title: page.title,
      description: page.description,
      indexable: true,
      translations: PUBLIC_LANGUAGES.map((language) => ({
        language,
        path: localizedCollection(name, language).path,
      })),
    };
  }),
  ...ARTICLES.map((article) => {
    const page = localizedArticle(article, language);
    return {
      kind: SitePageKind.Article,
      path: page.path,
      language,
      title: page.title,
      description: page.description,
      dateModified: page.dateModified,
      indexable: true,
      translations: PUBLIC_LANGUAGES.map((language) => ({
        language,
        path: localizedArticle(article, language).path,
      })),
    };
  }),
]);

/** Canonical public routes; each content scope remains responsible for its metadata. */
export const SITE_PAGES: readonly SitePage[] = [
  {
    kind: SitePageKind.Editor,
    path: EDITOR_TOOL.path,
    title: "Xprite — Free Online Pixel Art & Animation Editor",
    description: EDITOR_TOOL.description,
    indexable: true,
  },
  ...[TOOLS_HOME, ...TOOLS].map((tool) => ({
    kind: SitePageKind.Tool,
    path: tool.path,
    title: tool.title,
    description: tool.description,
    indexable: true,
  })),
  ...localizedPublishedPages,
  ...DOCUMENT_PAGES,
];

/** Addresses production served before the `/zh-CN/` root prefix; nothing else is redirected. */
const LEGACY_PAGES: readonly (readonly [string, string])[] = [
  ["/help/en/", GUIDE_PAGES[PublicLanguage.English].path],
  ["/help/zh-CN/", GUIDE_PAGES[PublicLanguage.SimplifiedChinese].path],
  ["/showcase/", SHOWCASE_PAGES[PublicLanguage.English].path],
  ["/showcase/en/", SHOWCASE_PAGES[PublicLanguage.English].path],
  ["/showcase/zh-CN/", SHOWCASE_PAGES[PublicLanguage.SimplifiedChinese].path],
];

export const SITE_REDIRECTS: Readonly<Record<string, string>> = Object.fromEntries([
  ...SITE_PAGES.filter((page) => page.path !== "/" && page.path.endsWith("/")).flatMap(
    ({ path }) => [
      [path.slice(0, -1), path],
      [`${path}index.html`, path],
    ],
  ),
  ...LEGACY_PAGES.flatMap(([legacy, path]) => [
    [legacy.slice(0, -1), path],
    [legacy, path],
    [`${legacy}index.html`, path],
  ]),
]);
