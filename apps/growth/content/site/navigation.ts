import { GUIDE_PAGES } from "../help/pages.ts";
import { SHOWCASE_PAGES } from "../showcase/pages.ts";
import { EDITOR_TOOL, TOOLS, translateToolText } from "../tools/index.ts";
import { documentLinks } from "./documents.ts";
import {
  localizedSiteHref,
  pickText,
  PUBLIC_LANGUAGE_LABELS,
  PUBLIC_LANGUAGES,
  publicLanguage,
  PublicLanguage,
} from "./language.ts";

const ABOUT_LABELS = { en: "About", "zh-CN": "关于", ja: "概要", ko: "소개" } as const;

export function showcasePath(language = "en"): string {
  return SHOWCASE_PAGES[publicLanguage(language)].path;
}

/** The product overview is the website home; the root URL opens the editor. */
export function showcaseLabel(language = "en"): string {
  return ABOUT_LABELS[publicLanguage(language)];
}

enum FooterGroupOrder {
  Product,
  Tools,
  Resources,
}

interface NavigationNode {
  label: string;
  href?: string;
  children?: readonly NavigationNode[];
  footerOrder?: FooterGroupOrder;
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
  const text = (english: string, chinese: string, japanese: string, korean: string) =>
    pickText(language, english, chinese, japanese, korean);
  return [
    { label: showcaseLabel(language), href: showcasePath(language) },
    {
      label: text("Tools", "工具", "ツール", "도구"),
      footerOrder: FooterGroupOrder.Tools,
      children: [
        {
          label: text("Pixel Art Editor", "像素编辑器", "ドット絵エディター", "도트 에디터"),
          href: EDITOR_TOOL.path,
        },
        ...TOOLS.map((tool) => ({
          label: translateToolText(tool.label, language),
          href: localizedSiteHref(tool.path, language),
        })),
      ],
    },
    {
      label: text("Resources", "资料", "リソース", "자료"),
      footerOrder: FooterGroupOrder.Resources,
      children: [
        {
          label:
            guideHref?.startsWith("/tools/") || guideHref?.startsWith("#")
              ? text("Read Me", "使用说明", "使い方", "사용 방법")
              : text("User guide", "使用指南", "ユーザーガイド", "사용 가이드"),
          href: localizedSiteHref(guideHref ?? GUIDE_PAGES[language].path, language),
        },
        ...documentLinks(language, "/privacy/"),
      ],
    },
    {
      label: text("Product", "产品", "製品", "제품"),
      footerOrder: FooterGroupOrder.Product,
      children: [
        { label: showcaseLabel(language), href: showcasePath(language) },
        ...documentLinks(language, "/about/"),
      ],
    },
  ];
}

/** Independent apps supply their own commands and settings beside this discovery tree. */
export function siteApplications(
  currentPath: string,
  language = "en",
  guideHref?: string,
): readonly SiteApplicationItem[] {
  const selectedLanguage = publicLanguage(language);
  const tool = TOOLS.find((tool) => tool.path === currentPath);
  const declaredGuide =
    guideHref ??
    (tool && "guidePath" in tool && typeof tool.guidePath === "string"
      ? tool.guidePath
      : undefined);
  const helpHref =
    declaredGuide &&
    (declaredGuide.startsWith("#") ||
      declaredGuide === currentPath ||
      declaredGuide.startsWith(`${currentPath}#`))
      ? undefined
      : declaredGuide;
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
                  pickText(selectedLanguage, "Overview", "概览", "概要", "개요"),
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
  return navigationTree(selectedLanguage, helpHref).map(item);
}

export function siteFooterGroups(language = "en", guideHref?: string): readonly SiteFooterGroup[] {
  const tree = navigationTree(publicLanguage(language), guideHref);
  const links = (node: NavigationNode): { label: string; href: string }[] => [
    ...(node.href ? [{ label: node.label, href: node.href }] : []),
    ...(node.children ?? []).flatMap(links),
  ];
  const topLevelLinks = tree.filter((node) => node.footerOrder === undefined).flatMap(links);
  return tree
    .filter((node) => node.footerOrder !== undefined)
    .sort((left, right) => left.footerOrder! - right.footerOrder!)
    .map((node) => {
      const entries = [
        ...(node.footerOrder === FooterGroupOrder.Product ? topLevelLinks : []),
        ...links(node),
      ];
      const seen = new Set<string>();
      return {
        label: node.label,
        links: entries.filter((link) => {
          if (seen.has(link.href)) return false;
          seen.add(link.href);
          return true;
        }),
      };
    });
}

/** Menubar links to the other published languages of one page, in switcher order. */
export function languageSwitchLinks(
  current: PublicLanguage,
  hrefs: Partial<Record<PublicLanguage, string>>,
  end = false,
) {
  return PUBLIC_LANGUAGES.filter((language) => language !== current && hrefs[language]).map(
    (language, index) => ({
      label: PUBLIC_LANGUAGE_LABELS[language],
      href: hrefs[language]!,
      hrefLang: language,
      icon: "language" as const,
      end: end && index === 0,
    }),
  );
}
