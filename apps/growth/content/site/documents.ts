import { FEATURE_DETAILS, FEATURE_DETAIL_PATH, FEATURES_PATH } from "../features/index.ts";
import { localizedSiteHref, PublicLanguage } from "./language.ts";

/** A page whose body is one Markdown file per written language. */
export interface SiteDocumentDefinition {
  /** Unprefixed path; each language's URL comes from `localizedSiteHref`. */
  path: string;
  /** Markdown source relative to the repository root. Only written languages are published. */
  sources: Partial<Readonly<Record<PublicLanguage, string>>>;
  /** Matches each source's `# ` heading. */
  title: Partial<Readonly<Record<PublicLanguage, string>>>;
  /** A concise label for menus and the footer when the page title needs more context. */
  navigationTitle?: Partial<Readonly<Record<PublicLanguage, string>>>;
  /** The document `<title>` for search results; the visible heading stays `title`. */
  searchTitle?: Partial<Readonly<Record<PublicLanguage, string>>>;
  /** The meta description; defaults to the visible introduction paragraph. */
  searchDescription?: Partial<Readonly<Record<PublicLanguage, string>>>;
}

const ABOUT_CONTENT = "apps/growth/content/about";

export const SITE_DOCUMENTS: readonly SiteDocumentDefinition[] = [
  ...FEATURE_DETAILS.map((feature) => ({
    path: `${FEATURE_DETAIL_PATH}${feature.slug}/`,
    sources: {
      en: `apps/growth/content/features/details/${feature.slug}.en.md`,
      "zh-CN": `apps/growth/content/features/details/${feature.slug}.zh-CN.md`,
    },
    title: feature.title,
    searchTitle: feature.searchTitle,
    searchDescription: "searchDescription" in feature ? feature.searchDescription : undefined,
  })),
  {
    path: "/privacy/",
    sources: { en: "PRIVACY.md", "zh-CN": "PRIVACY.zh.md" },
    title: { en: "Privacy Notice", "zh-CN": "隐私说明" },
    navigationTitle: { en: "Privacy", "zh-CN": "隐私" },
    searchDescription: {
      en: "What data the Xprite editor, website and tools use. No account is required. Sites that host Xprite, such as itch.io, may have their own privacy practices.",
    },
  },
  {
    path: "/about/how-it-works/",
    sources: {
      en: `${ABOUT_CONTENT}/how-it-works.en.md`,
      "zh-CN": `${ABOUT_CONTENT}/how-it-works.zh-CN.md`,
    },
    title: { en: "How Xprite Works", "zh-CN": "工作原理" },
    navigationTitle: { en: "How it works" },
    searchDescription: {
      en: "How Xprite brings the Aseprite editor into the browser: reading and writing .aseprite, crisp Canvas pixels, local storage, offline startup and touch input.",
      "zh-CN":
        "Xprite 怎样把 Aseprite 的编辑器搬进浏览器：读写 .aseprite、用 Canvas 画出不糊的像素、作品存在本地、断网时打开，以及适配触控和手写笔。",
    },
  },
  {
    path: FEATURES_PATH,
    sources: {
      en: `${ABOUT_CONTENT}/features.en.md`,
      "zh-CN": `${ABOUT_CONTENT}/features.zh-CN.md`,
    },
    title: { en: "Features", "zh-CN": "功能" },
    searchTitle: {
      en: "Pixel Art Editor Features: Draw, Animate, Export | Xprite",
      "zh-CN": "像素画编辑器功能：绘画、动画与导出 | Xprite",
    },
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
    label: document.navigationTitle?.[language] ?? document.title[language]!,
    href: localizedSiteHref(document.path, language),
  }));
}
