import { ARTICLES, localizedArticle } from "../articles/index.ts";
import { CREATE_PAGES } from "../create/index.ts";
import { DESIGN_SCHOOL_PAGES } from "../design-school/index.ts";
import { LEGAL_PAGES } from "../legal/index.ts";
import { PRODUCT_PAGES } from "../product/index.ts";
import { RESOURCE_PAGES } from "../resources/index.ts";
import { SHOWCASE_PAGES } from "../showcase/pages.ts";
import { SUPPORT_PAGES } from "../support/index.ts";
import { TOOLS, TOOLS_HOME, translateToolText } from "../tools/index.ts";
import { localizedSiteHref, publicLanguage, PublicLanguage } from "./language.ts";
import type { PlannedPageDefinition } from "./planned-page.ts";

const HOME_LABELS = { en: "Home", "zh-CN": "首页" } as const;

export function showcasePath(language = "en"): string {
  return SHOWCASE_PAGES[publicLanguage(language)].path;
}

/** The product showcase is the website home; the root URL opens the editor. */
export function showcaseLabel(language = "en"): string {
  return HOME_LABELS[publicLanguage(language)];
}

interface NavigationNode {
  label: string;
  href?: string;
  children?: readonly NavigationNode[];
}

export interface SiteApplicationItem {
  label: string;
  href?: string;
  current?: boolean;
  checked?: boolean;
  children?: readonly SiteApplicationItem[];
}

export interface SiteFooterGroup {
  label: string;
  links: readonly { label: string; href: string }[];
}

function scopeNavigation(
  pages: readonly PlannedPageDefinition[],
  language: PublicLanguage,
): NavigationNode[] {
  return pages.map((page) => ({
    label: page.title[language],
    href: localizedSiteHref(page.path, language),
    ...(page.children ? { children: scopeNavigation(page.children, language) } : {}),
  }));
}

/** One hierarchy supplies the website menu and footer. */
function navigationTree(language: PublicLanguage, guideHref?: string): NavigationNode[] {
  const text = (english: string, chinese: string) =>
    language === PublicLanguage.SimplifiedChinese ? chinese : english;
  const articleLinks = (collection: "learn" | "compare") =>
    ARTICLES.filter((article) => article.collection === collection).map((article) => ({
      label: localizedArticle(article, language).title,
      href: localizedSiteHref(article.path, language),
    }));
  return [
    { label: showcaseLabel(language), href: showcasePath(language) },
    { label: text("Start editing", "开始创作"), href: "/editor" },
    ...scopeNavigation(CREATE_PAGES, language),
    ...scopeNavigation(RESOURCE_PAGES, language),
    {
      label: text("Tools", "工具"),
      href: localizedSiteHref(TOOLS_HOME.path, language),
      children: TOOLS.map((tool) => ({
        label: translateToolText(tool.label, language),
        href: localizedSiteHref(tool.path, language),
      })),
    },
    {
      label: text("Tutorials and help", "教程与帮助"),
      children: [
        {
          label: text("User guide", "使用指南"),
          href: localizedSiteHref(guideHref ?? `/help/${language}/`, language),
        },
        ...scopeNavigation(DESIGN_SCHOOL_PAGES, language),
        {
          label: text("File guides", "文件导出指南"),
          href: localizedSiteHref("/learn/", language),
          children: articleLinks("learn"),
        },
        ...scopeNavigation(SUPPORT_PAGES, language),
      ],
    },
    {
      label: text("Product", "产品介绍"),
      children: [
        { label: text("Meet Xprite", "认识 Xprite"), href: showcasePath(language) },
        ...scopeNavigation(PRODUCT_PAGES, language),
        {
          label: text("Editor comparisons", "编辑器比较"),
          href: localizedSiteHref("/compare/", language),
          children: articleLinks("compare"),
        },
      ],
    },
    ...scopeNavigation(LEGAL_PAGES, language),
  ];
}

/** Independent apps supply their own commands and settings beside this discovery tree. */
export function siteApplications(
  currentPath: string,
  language = "en",
  includeGallery = false,
  guideHref?: string,
): readonly SiteApplicationItem[] {
  const selectedLanguage = publicLanguage(language);
  const helpHref = guideHref ?? TOOLS.find((tool) => tool.path === currentPath)?.guidePath;
  const normalizeCurrent = (path: string) => {
    const pathname = path.split("?")[0];
    return pathname === "/editor" ? "/" : pathname;
  };
  const application = (label: string, href: string): SiteApplicationItem => {
    const current = normalizeCurrent(currentPath) === normalizeCurrent(href);
    return { label, href, checked: current, current };
  };
  const item = (node: NavigationNode): SiteApplicationItem => {
    if (node.children) {
      return {
        label: node.label,
        children: [
          ...(node.href
            ? [
                application(
                  selectedLanguage === PublicLanguage.SimplifiedChinese ? "概览" : "Overview",
                  node.href,
                ),
              ]
            : []),
          ...node.children.map(item),
        ],
      };
    }
    return application(node.label, node.href!);
  };
  return [
    ...navigationTree(selectedLanguage, helpHref).map(item),
    ...(includeGallery
      ? [
          application(
            selectedLanguage === PublicLanguage.SimplifiedChinese ? "UI 组件库" : "UI Gallery",
            localizedSiteHref("/gallery/", selectedLanguage),
          ),
        ]
      : []),
  ];
}

export function siteFooterGroups(language = "en"): readonly SiteFooterGroup[] {
  const links = (node: NavigationNode): { label: string; href: string }[] => [
    ...(node.href ? [{ label: node.label, href: node.href }] : []),
    ...(node.children?.flatMap(links) ?? []),
  ];
  return navigationTree(publicLanguage(language))
    .filter((node) => node.children)
    .map((node) => ({ label: node.label, links: links(node) }));
}
