import { localizedSiteHref, PublicLanguage } from "./language.ts";

/** A page whose body is one Markdown file per written language. */
export interface SiteDocumentDefinition {
  /** Unprefixed path; each language's URL comes from `localizedSiteHref`. */
  path: string;
  /** Markdown source relative to the repository root. Only written languages are published. */
  sources: Partial<Readonly<Record<PublicLanguage, string>>>;
  /** Matches each source's `# ` heading; navigation reads it without loading Markdown. */
  title: Partial<Readonly<Record<PublicLanguage, string>>>;
}

const ABOUT_CONTENT = "apps/growth/content/about";

export const SITE_DOCUMENTS: readonly SiteDocumentDefinition[] = [
  {
    path: "/privacy/",
    sources: { en: "PRIVACY.md", "zh-CN": "PRIVACY.zh.md" },
    title: { en: "Xprite Privacy Notice", "zh-CN": "Xprite 隐私说明" },
  },
  {
    path: "/about/how-it-works/",
    sources: {
      en: `${ABOUT_CONTENT}/how-it-works.en.md`,
      "zh-CN": `${ABOUT_CONTENT}/how-it-works.zh-CN.md`,
    },
    title: { en: "How Xprite Works", "zh-CN": "工作原理" },
  },
  {
    path: "/about/features/",
    sources: {
      en: `${ABOUT_CONTENT}/features.en.md`,
      "zh-CN": `${ABOUT_CONTENT}/features.zh-CN.md`,
    },
    title: { en: "Features", "zh-CN": "功能介绍" },
  },
];

/** Written languages of a document with their public paths. */
export function documentTranslations(document: SiteDocumentDefinition) {
  return Object.values(PublicLanguage)
    .filter((language) => document.sources[language])
    .map((language) => ({ language, path: localizedSiteHref(document.path, language) }));
}

/** Navigation entries for the documents written in one language. */
export function documentLinks(language: PublicLanguage, parent: string) {
  return SITE_DOCUMENTS.filter(
    (document) => document.sources[language] && document.path.startsWith(parent),
  ).map((document) => ({
    label: document.title[language]!,
    href: localizedSiteHref(document.path, language),
  }));
}
