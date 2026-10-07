import {
  SHOWCASE_DEFAULT_PATH,
  SHOWCASE_PAGES,
  SHOWCASE_SITE_URL,
} from "../src/managers/showcase/showcase-pages.ts";
import { publicUiScope } from "./public-theme.ts";
import { applyPageSearchMetadata } from "./seo.ts";
import { renderPublicUi } from "./static-ui-renderer.ts";

const CANONICAL_ELEMENT_PATTERN = /\s*<link\b[^>]*rel=["']canonical["'][^>]*>/gi;
const HEAD_CLOSE_PATTERN = /<\/head>/i;
const ALTERNATE_ELEMENT_PATTERN = /\s*<link\b[^>]*rel=["']alternate["'][^>]*>/gi;
const SHOWCASE_STATIC_PATTERN =
  /<!-- showcase-static-start -->[\s\S]*?<!-- showcase-static-end -->/;
const CHINESE_FONT_PRELOAD_PATTERN = /\s*<link\b[^>]*id=["']showcase-chinese-font["'][^>]*>/gi;
const CHINESE_SHOWCASE_LANGUAGE = "zh-CN";

export function applyShowcaseSearchMetadata(
  html: string,
  language: keyof typeof SHOWCASE_PAGES,
  indexable: boolean,
): string {
  const page = SHOWCASE_PAGES[language];
  const canonical = new URL(page.path, SHOWCASE_SITE_URL).href;
  const content = applyPageSearchMetadata(html, indexable)
    .replace(
      SHOWCASE_STATIC_PATTERN,
      `<!-- showcase-static-start -->${publicUiScope(`<main>${renderPublicUi("showcase-hero", { language })}${renderPublicUi("showcase-stories", { language })}</main>`)}<!-- showcase-static-end -->`,
    )
    .replace(CHINESE_FONT_PRELOAD_PATTERN, language === CHINESE_SHOWCASE_LANGUAGE ? "$&" : "")
    .replace(CANONICAL_ELEMENT_PATTERN, "")
    .replace(ALTERNATE_ELEMENT_PATTERN, "")
    .replace(/(<html\b[^>]*\blang=)["'][^"']*["']/i, `$1"${language}"`)
    .replace(/<title>[^<]*<\/title>/i, `<title>${page.title}</title>`)
    .replace(
      /<meta\s+name="description"[^>]*>/i,
      `<meta name="description" content="${page.description}">`,
    )
    .replace(
      /<meta\s+property="og:title"[^>]*>/i,
      `<meta property="og:title" content="${page.title}">`,
    )
    .replace(
      /<meta\s+property="og:description"[^>]*>/i,
      `<meta property="og:description" content="${page.description}">`,
    )
    .replace(/<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${canonical}">`)
    .replace(
      /<meta\s+name="twitter:title"[^>]*>/i,
      `<meta name="twitter:title" content="${page.title}">`,
    )
    .replace(
      /<meta\s+name="twitter:description"[^>]*>/i,
      `<meta name="twitter:description" content="${page.description}">`,
    );
  if (!indexable) return content;
  const alternates = Object.entries(SHOWCASE_PAGES)
    .map(
      ([locale, item]) =>
        `<link rel="alternate" hreflang="${locale}" href="${new URL(item.path, SHOWCASE_SITE_URL).href}">`,
    )
    .join("\n");
  return content.replace(
    HEAD_CLOSE_PATTERN,
    `<link rel="canonical" href="${canonical}">\n${alternates}\n<link rel="alternate" hreflang="x-default" href="${new URL(SHOWCASE_DEFAULT_PATH, SHOWCASE_SITE_URL).href}">\n</head>`,
  );
}
