import {
  ARTICLES,
  ARTICLE_COLLECTIONS,
  localizedArticle,
  localizedCollection,
} from "../articles/index.ts";
import { CREATE_PAGES } from "../create/index.ts";
import { DESIGN_SCHOOL_PAGES } from "../design-school/index.ts";
import { GUIDE_PAGES } from "../help/pages.ts";
import { LEGAL_PAGES } from "../legal/index.ts";
import { PRODUCT_PAGES } from "../product/index.ts";
import { RESOURCE_PAGES } from "../resources/index.ts";
import { SHOWCASE_PAGES } from "../showcase/pages.ts";
import { SUPPORT_PAGES } from "../support/index.ts";
import { EDITOR_TOOL, TOOLS, TOOLS_HOME } from "../tools/index.ts";
import { localizedSiteHref, PublicLanguage } from "./language.ts";
import type { PlannedPageDefinition } from "./planned-page.ts";

export enum SitePageKind {
  Editor = "editor",
  Tool = "tool",
  Showcase = "showcase",
  Guide = "guide",
  Article = "article",
  Placeholder = "placeholder",
}

export interface SitePage {
  kind: SitePageKind;
  path: string;
  language?: PublicLanguage;
  title: string;
  description?: string;
  dateModified?: string;
  document?: string;
  indexable: boolean;
  translations?: readonly { language: PublicLanguage; path: string }[];
}

const PUBLIC_LANGUAGES = Object.values(PublicLanguage);

function placeholderPages(definitions: readonly PlannedPageDefinition[]): SitePage[] {
  return definitions.flatMap((definition) => {
    const translations = PUBLIC_LANGUAGES.map((language) => ({
      language,
      path: localizedSiteHref(definition.path, language),
    }));
    return [
      ...translations.map(({ language, path }) => ({
        kind: SitePageKind.Placeholder,
        path,
        language,
        title: definition.title[language],
        document: definition.document,
        indexable: false,
        translations,
      })),
      ...placeholderPages(definition.children ?? []),
    ];
  });
}

/** Reserved pages render their title while their content is being prepared. */
export const PLANNED_PAGES: readonly SitePage[] = placeholderPages([
  ...CREATE_PAGES,
  ...RESOURCE_PAGES,
  ...DESIGN_SCHOOL_PAGES,
  ...SUPPORT_PAGES,
  ...PRODUCT_PAGES,
  ...LEGAL_PAGES,
]);

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
  ...PLANNED_PAGES,
];

export const SITE_REDIRECTS: Readonly<Record<string, string>> = Object.fromEntries(
  SITE_PAGES.filter((page) => page.path !== "/" && page.path.endsWith("/")).flatMap(({ path }) => [
    [path.slice(0, -1), path],
    [`${path}index.html`, path],
  ]),
);
