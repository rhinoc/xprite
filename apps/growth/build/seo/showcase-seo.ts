import { FEATURES_PATH } from "../../content/features/index.ts";
import { SHOWCASE_SEARCH_ATTRIBUTE, showcaseSearchMetadata } from "../../content/showcase/index.ts";
import { LANDING_EDITOR_HREF, landingCopy } from "../../content/showcase/landing.ts";
import {
  SHOWCASE_DEFAULT_PATH,
  SHOWCASE_PAGES,
  SHOWCASE_SITE_URL,
} from "../../content/showcase/pages.ts";
import { localizedSiteHref, pickText, publicLanguage } from "../../content/site/language.ts";
import { languageSwitchLinks, showcaseLabel } from "../../content/site/navigation.ts";
import { publicDesktopNavigation, publicSiteFooter, publicUiScope } from "../public-theme.ts";
import { renderPublicUi } from "../static-ui-renderer.ts";
import { applyPageSearchMetadata } from "./index.ts";

const CANONICAL_ELEMENT_PATTERN = /\s*<link\b[^>]*rel=["']canonical["'][^>]*>/gi;
const HEAD_CLOSE_PATTERN = /<\/head>/i;
const ALTERNATE_ELEMENT_PATTERN = /\s*<link\b[^>]*rel=["']alternate["'][^>]*>/gi;
const SHOWCASE_STATIC_PATTERN =
  /<!-- showcase-static-start -->[\s\S]*?<!-- showcase-static-end -->/;
const CHINESE_FONT_PRELOAD_PATTERN = /\s*<link\b[^>]*id=["']showcase-chinese-font["'][^>]*>/gi;
const PRODUCT_PAGE_SCHEMA_PATTERN =
  /\s*<script\b[^>]*data-showcase-search[^>]*>[\s\S]*?<\/script>/gi;
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  '"': "&quot;",
  "<": "&lt;",
  ">": "&gt;",
};
const escapeHtml = (value: string) =>
  value.replace(/[&"<>]/g, (character) => HTML_ENTITIES[character]);

/** The About page: hydrated site menubar and footer around the static landing body. */
function landingPage(language: keyof typeof SHOWCASE_PAGES): string {
  const copy = landingCopy(language);
  const navigation = publicDesktopNavigation({
    label: pickText(
      publicLanguage(language),
      "Website navigation",
      "网站导航",
      "サイトナビゲーション",
      "웹사이트 탐색",
      "Навигация по сайту",
      "Navegação do site",
      "Navegación del sitio",
    ),
    language,
    currentHref: SHOWCASE_PAGES[language].path,
    brandLabel: showcaseLabel(language),
    brandHref: SHOWCASE_PAGES[language].path,
    links: [
      { label: copy.features, href: localizedSiteHref(FEATURES_PATH, language) },
      { label: copy.openEditor, href: LANDING_EDITOR_HREF },
      ...languageSwitchLinks(
        publicLanguage(language),
        Object.fromEntries(
          Object.entries(SHOWCASE_PAGES).map(([value, page]) => [value, page.path]),
        ),
        true,
      ),
    ],
  });
  return publicUiScope(
    `<div data-showcase-static-page><header>${navigation}</header><main>${renderPublicUi("landing", { language })}</main>${publicSiteFooter(language)}</div>`,
    language,
  );
}

export function applyShowcaseSearchMetadata(
  html: string,
  language: keyof typeof SHOWCASE_PAGES,
  indexable: boolean,
): string {
  const page = SHOWCASE_PAGES[language];
  const canonical = new URL(page.path, SHOWCASE_SITE_URL).href;
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const content = applyPageSearchMetadata(html, indexable)
    .replace(PRODUCT_PAGE_SCHEMA_PATTERN, "")
    .replace(
      SHOWCASE_STATIC_PATTERN,
      `<!-- showcase-static-start -->${landingPage(language)}<!-- showcase-static-end -->`,
    )
    .replace(CHINESE_FONT_PRELOAD_PATTERN, language === "en" ? "" : "$&")
    .replace(CANONICAL_ELEMENT_PATTERN, "")
    .replace(ALTERNATE_ELEMENT_PATTERN, "")
    .replace(/(<html\b[^>]*\blang=)["'][^"']*["']/i, `$1"${language}"`)
    .replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`)
    .replace(
      /<meta\s+name="description"[^>]*>/i,
      `<meta name="description" content="${description}">`,
    )
    .replace(/<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${title}">`)
    .replace(
      /<meta\s+property="og:description"[^>]*>/i,
      `<meta property="og:description" content="${description}">`,
    )
    .replace(/<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${canonical}">`)
    .replace(
      /<meta\s+name="twitter:title"[^>]*>/i,
      `<meta name="twitter:title" content="${title}">`,
    )
    .replace(
      /<meta\s+name="twitter:description"[^>]*>/i,
      `<meta name="twitter:description" content="${description}">`,
    );
  if (!indexable) return content;
  const schema = showcaseSearchMetadata(language, page, SHOWCASE_SITE_URL);
  const alternates = Object.entries(SHOWCASE_PAGES)
    .map(
      ([locale, item]) =>
        `<link rel="alternate" hreflang="${locale}" href="${new URL(item.path, SHOWCASE_SITE_URL).href}">`,
    )
    .join("\n");
  return content.replace(
    HEAD_CLOSE_PATTERN,
    `<link rel="canonical" href="${canonical}">\n${alternates}\n<link rel="alternate" hreflang="x-default" href="${new URL(SHOWCASE_DEFAULT_PATH, SHOWCASE_SITE_URL).href}">\n<script type="application/ld+json" ${SHOWCASE_SEARCH_ATTRIBUTE}>${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script>\n</head>`,
  );
}
