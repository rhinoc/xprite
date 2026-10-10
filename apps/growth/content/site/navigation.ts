import { ARTICLES, localizedArticle } from "../articles/index.ts";
import { GUIDE_PAGES } from "../help/pages.ts";
import { SHOWCASE_PAGES } from "../showcase/pages.ts";
import { TOOLS, TOOLS_HOME, translateToolText } from "../tools/index.ts";
import { documentLinks } from "./documents.ts";
import { localizedSiteHref, publicLanguage, PublicLanguage } from "./language.ts";

/** Page titles end with the site name; menu labels do not repeat it. */
const TITLE_SUFFIX = / \| Xprite$/;

const HOME_LABELS = { en: "About Xprite", "zh-CN": "关于 Xprite" } as const;

export function showcasePath(language = "en"): string {
  return SHOWCASE_PAGES[publicLanguage(language)].path;
}

/** The about page is the website home; the root URL opens the editor. */
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

/** One hierarchy supplies the website menu and footer. */
function navigationTree(language: PublicLanguage, guideHref?: string): NavigationNode[] {
  const text = (english: string, chinese: string) =>
    language === PublicLanguage.SimplifiedChinese ? chinese : english;
  const articleLinks = (collection: "learn" | "compare") =>
    ARTICLES.filter((article) => article.collection === collection).map((article) => ({
      label: localizedArticle(article, language).title.replace(TITLE_SUFFIX, ""),
      href: localizedSiteHref(article.path, language),
    }));
  return [
    { label: showcaseLabel(language), href: showcasePath(language) },
    { label: text("Start editing", "开始创作"), href: "/editor" },
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
          href: localizedSiteHref(guideHref ?? GUIDE_PAGES[language].path, language),
        },
        {
          label: text("File guides", "文件导出指南"),
          href: localizedSiteHref("/learn/", language),
          children: articleLinks("learn"),
        },
      ],
    },
    {
      label: text("Product", "产品介绍"),
      children: [
        { label: text("Meet Xprite", "认识 Xprite"), href: showcasePath(language) },
        ...documentLinks(language, "/about/"),
        {
          label: text("Editor comparisons", "编辑器比较"),
          href: localizedSiteHref("/compare/", language),
          children: articleLinks("compare"),
        },
        ...documentLinks(language, "/privacy/"),
      ],
    },
  ];
}

/** Independent apps supply their own commands and settings beside this discovery tree. */
export function siteApplications(
  currentPath: string,
  language = "en",
  includeComponents = false,
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
    ...(includeComponents
      ? [
          application(
            selectedLanguage === PublicLanguage.SimplifiedChinese ? "UI 组件库" : "UI Components",
            localizedSiteHref("/components/", selectedLanguage),
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
