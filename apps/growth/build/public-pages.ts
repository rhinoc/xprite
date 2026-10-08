import { existsSync, readFileSync, statSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { Marked, Renderer } from "marked";
import type { Tokens } from "marked";
import type { Connect, Plugin, ResolvedConfig, ViteDevServer } from "vite";

import {
  DevelopmentApp,
  GROWTH_DEVELOPMENT_BASE,
  developmentSiteProxy,
} from "../../../infra/dev-site.ts";
import { publicDesktopStartupScript } from "../../../infra/public-desktop-startup.ts";
import { applySiteIcons, siteIcons } from "../../../infra/site-html.ts";
import { ARTICLES, ARTICLE_PATHS, ARTICLE_REDIRECTS } from "../content/articles/index.ts";
import {
  ANIMAL_CROSSING_TOOL,
  GIF_SHEET_TOOL,
  TOOLS_HOME,
  TOOL_PATHS,
} from "../content/tools/index.ts";
import { SHOWCASE_PAGES } from "../src/managers/showcase/showcase-pages.ts";
import {
  ARTICLE_CONTENT_ROOT,
  ARTICLE_STYLE_PATH,
  articleHtml,
  articleStylesheet,
} from "./article-pages.ts";
import { createPublicMiddleware } from "./public-routing.ts";
import {
  PUBLIC_THEME_ATTRIBUTES,
  PUBLIC_THEME_STYLE_PATH,
  PUBLIC_FONT_STYLE_PATH,
  PUBLIC_FONT_PATH,
  PUBLIC_MINI_FONT_PATH,
  GROWTH_DESKTOP_STYLE_PATH,
  PUBLIC_HELP_ICON_PATH,
  PUBLIC_LANGUAGE_ICON_PATH,
  publicPattern,
  publicIconLink,
  publicDesktopWindow,
  publicDesktopNavigation,
  publicDesktopButton,
  publicRichText,
  publicIndex,
  publicUiScope,
} from "./public-theme.ts";
import { applyPageSearchMetadata } from "./seo.ts";
import { applyShowcaseSearchMetadata } from "./showcase-seo.ts";
import { siteNavigationHref } from "./site-navigation.ts";
import { createPublicUiRenderer, PUBLIC_UI_ASSET_PREFIX } from "./static-ui-renderer.ts";

enum GuideLanguage {
  English = "en",
  SimplifiedChinese = "zh-CN",
}

const SITE_URL = "https://xprite.cc/";
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const APP_ROOT = resolve(REPOSITORY_ROOT, "apps/growth");
const GUIDE_ROOT = resolve(REPOSITORY_ROOT, "apps/growth/content/help");
const PUBLIC_ROOT = resolve(REPOSITORY_ROOT, "apps/growth/public");
const ASSET_MANIFEST_PATH = "/package.json";
const GUIDE_STYLE_PATH = "/help/guide.css";
const REDIRECTS_FILE = resolve(REPOSITORY_ROOT, "edgeone.json");
const CHINESE_FONT_PATH = "/help/fusion-pixel.woff2";
const APP_PATHS = ["/", "/editor", "/editor/", "/tools/viewer/"];
const SHOWCASE_PATH = "/showcase";
const SHOWCASE_HTML_PATH = `${SHOWCASE_PATH}/index.html`;
const SHOWCASE_PATHS: readonly string[] = Object.values(SHOWCASE_PAGES).map((page) => page.path);
const DEVELOPMENT_PREFIXES = ["/@", "/src/", "/content/", "/node_modules/"];
const SUCCESS_STATUS = 200;
const FORWARDED_STATUS = 204;
const HEAD_METHOD = "HEAD";
const VIEWER_PATH = "/tools/viewer/";
const HTML_TYPE = "text/html; charset=utf-8";
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const GUIDES = [
  {
    language: GuideLanguage.English,
    path: "/help/en/",
    title: "Xprite User Guide",
    description:
      "Save and recover projects, arrange your workspace, use touch and pen input, and install Xprite for offline editing.",
    openEditor: "Open editor",
    navigation: "User guide navigation",
  },
  {
    language: GuideLanguage.SimplifiedChinese,
    path: "/help/zh-CN/",
    title: "Xprite 使用指南",
    description:
      "Xprite 浏览器保存与恢复、工作区布局、触摸与手写笔、快捷操作栏及安装与离线使用指南。",
    openEditor: "打开编辑器",
    navigation: "使用指南导航",
  },
] as const;
type Guide = (typeof GUIDES)[number];
interface PublicPage {
  language: GuideLanguage;
  path: string;
  title: string;
  description: string;
  navigation: string;
}
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
const headingId = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "");

function publicRedirects(): Record<string, string> {
  const configuration = JSON.parse(readFileSync(REDIRECTS_FILE, "utf8"));
  return {
    ...Object.fromEntries(
      configuration.redirects
        .filter((item: { source: string }) => item.source.startsWith("/"))
        .map((item: { source: string; destination: string }) => [item.source, item.destination]),
    ),
    ...ARTICLE_REDIRECTS,
  };
}

function publicPageResources(): Map<string, string> {
  const resources = new Map([
    [
      PUBLIC_LANGUAGE_ICON_PATH,
      resolve(REPOSITORY_ROOT, "packages/ui/assets/icons/system/language.svg"),
    ],
    [PUBLIC_HELP_ICON_PATH, resolve(REPOSITORY_ROOT, "packages/ui/assets/icons/system/help.svg")],
    [
      PUBLIC_FONT_PATH,
      resolve(REPOSITORY_ROOT, "packages/ui/assets/fonts/macintosh/chikarego2.woff2"),
    ],
    [
      PUBLIC_MINI_FONT_PATH,
      resolve(REPOSITORY_ROOT, "packages/ui/assets/fonts/macintosh/finderskeepers.woff2"),
    ],
    [
      PUBLIC_FONT_STYLE_PATH,
      resolve(REPOSITORY_ROOT, "packages/ui/assets/fonts/macintosh/fonts.css"),
    ],
    [GUIDE_STYLE_PATH, resolve(GUIDE_ROOT, "site.css")],
    [
      PUBLIC_THEME_STYLE_PATH,
      resolve(REPOSITORY_ROOT, "packages/ui/assets/themes/macintosh/macintosh-site.css"),
    ],
    [
      CHINESE_FONT_PATH,
      resolve(
        REPOSITORY_ROOT,
        "packages/ui/assets/fonts/fusion-pixel/fusion-pixel-10px-zh-hans.woff2",
      ),
    ],
  ]);
  const catalog = JSON.parse(readFileSync(resolve(GUIDE_ROOT, "images/catalog.json"), "utf8"));
  for (const guide of GUIDES) {
    const markdown = readFileSync(resolve(GUIDE_ROOT, `README.${guide.language}.md`), "utf8");
    const parser = new Marked({ gfm: false });
    parser.walkTokens(parser.lexer(markdown), (token) => {
      if (token.type !== "image") return;
      const source = resolve(GUIDE_ROOT, token.href);
      if (
        !token.href.startsWith("images/") ||
        !source.startsWith(`${GUIDE_ROOT}${sep}`) ||
        !catalog[token.href]
      )
        throw Error(`Guide image is not catalogued: ${token.href}`);
      resources.set(`/help/${token.href}`, source);
    });
  }
  return resources;
}

function guideHtml(guide: Guide, indexable: boolean): string {
  const markdown = readFileSync(resolve(GUIDE_ROOT, `README.${guide.language}.md`), "utf8");
  const catalog = JSON.parse(readFileSync(resolve(GUIDE_ROOT, "images/catalog.json"), "utf8"));
  const renderer = new Renderer();
  renderer.heading = function ({ tokens, depth, text }: Tokens.Heading) {
    return `<h${depth} id="${escapeHtml(headingId(text))}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
  };
  renderer.html = ({ text }) => escapeHtml(text);
  renderer.image = ({ href, text }: Tokens.Image) => {
    const dimensions = catalog[href];
    if (!dimensions) throw Error(`Guide image is not catalogued: ${href}`);
    return `<span class="guide-image" tabindex="0" aria-label="${escapeHtml(text)}"><img src="${escapeHtml(`/help/${href}`)}" alt="${escapeHtml(text)}" width="${Math.round(dimensions.displayWidth)}" height="${Math.round(dimensions.displayHeight)}" style="width:${dimensions.displayWidth}px;height:${dimensions.displayHeight}px" loading="lazy" decoding="async"></span>`;
  };
  renderer.link = function ({ href, tokens }: Tokens.Link) {
    const text = this.parser.parseInline(tokens);
    if (!/^(?:https?:\/\/|#|\/(?!\/))/i.test(href)) throw Error(`Unsupported guide link: ${href}`);
    return `<a href="${escapeHtml(siteNavigationHref(href))}">${text}</a>`;
  };
  const parser = new Marked({ gfm: false, async: false, renderer });
  const tokens = parser.lexer(markdown);
  const firstSectionIndex = tokens.findIndex(
    (token) => token.type === "heading" && token.depth === 2,
  );
  const introduction = tokens.slice(0, firstSectionIndex);
  const contentsToken = introduction.find((token) => token.type === "list");
  const headings = new Set(
    tokens
      .filter((token): token is Tokens.Heading => token.type === "heading")
      .map((token) => headingId(token.text)),
  );
  parser.walkTokens(tokens, (token) => {
    if (
      token.type === "link" &&
      token.href.startsWith("#") &&
      !headings.has(decodeURIComponent(token.href.slice(1)))
    )
      throw Error(`Broken guide section link: ${token.href}`);
  });
  const other = GUIDES.find((item) => item.language !== guide.language)!;
  const alternates = `${GUIDES.map((item) => `<link rel="alternate" hreflang="${item.language}" href="${new URL(item.path, SITE_URL).href}">`).join("\n")}
<link rel="alternate" hreflang="x-default" href="${new URL(GUIDES[0].path, SITE_URL).href}">`;
  return pageHtml(
    guide,
    indexable,
    `<div data-public-sidebar>${publicDesktopWindow(
      guide.language === GuideLanguage.English ? "Contents" : "目录",
      publicIndex(
        guide.navigation,
        tokens
          .filter((token): token is Tokens.Heading => token.type === "heading" && token.depth === 2)
          .map((heading) => ({ href: `#${headingId(heading.text)}`, label: heading.text })),
      ),
      "data-public-contents",
    )}</div>${publicDesktopWindow(guide.language === GuideLanguage.English ? "Xprite Help" : "Xprite 使用指南", `<div data-public-reader-scroll><article>${publicRichText(parser.parser(tokens.filter((token) => token !== contentsToken)), { "data-public-document-content": true })}</article></div>`, "data-public-document", `<span>${guide.language === GuideLanguage.English ? "User guide" : "使用指南"}</span><a href="/editor">${guide.openEditor}</a>`)}<nav data-public-shortcuts aria-label="${guide.navigation}">${publicIconLink(guide.openEditor, "/editor", "application")}${publicIconLink(guide.language === GuideLanguage.English ? "Applications" : "工具", "/tools/")}${publicIconLink(guide.language === GuideLanguage.English ? "File guides" : "文件导出", "/learn/")}</nav>`,
    [
      {
        label: guide.language === GuideLanguage.SimplifiedChinese ? "文件导出" : "File guides",
        href: "/learn/",
      },
      {
        label: guide.language === GuideLanguage.SimplifiedChinese ? "工具比较" : "Compare",
        href: "/compare/",
      },
      { label: guide.openEditor, href: "/editor" },
      {
        label: guide.language === GuideLanguage.SimplifiedChinese ? "切换语言" : "Switch language",
        href: other.path,
        hrefLang: other.language,
        icon: "language",
        end: true,
      },
      {
        label: guide.language === GuideLanguage.SimplifiedChinese ? "使用指南" : "User guide",
        href: guide.path,
        icon: "help",
      },
    ],
    alternates,
  );
}

function pageHtml(
  page: PublicPage,
  indexable: boolean,
  body: string,
  links: readonly {
    label: string;
    href: string;
    hrefLang?: string;
    icon?: "language" | "help";
    end?: boolean;
  }[],
  alternates = "",
  mainClass = "",
): string {
  const indexing = indexable
    ? `<link rel="canonical" href="${new URL(page.path, SITE_URL).href}">\n${alternates}`
    : "";
  return `<!doctype html>
<html lang="${page.language}" ${PUBLIC_THEME_ATTRIBUTES}><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<script>${publicDesktopStartupScript()}</script>
<title>${escapeHtml(page.title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<meta name="robots" content="${indexable ? "index, follow" : "noindex, follow"}">
${indexing}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Xprite">
<meta property="og:title" content="${escapeHtml(page.title)}">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:url" content="${new URL(page.path, SITE_URL).href}">
<meta property="og:image" content="${SITE_URL}social-preview.png">
<meta property="og:image:width" content="1920">
<meta property="og:image:height" content="820">
<meta property="og:image:alt" content="Xprite pixel art editor in desktop and phone browsers">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(page.title)}">
<meta name="twitter:description" content="${escapeHtml(page.description)}">
<meta name="twitter:image" content="${SITE_URL}social-preview.png">
${siteIcons()}
<link rel="preload" href="${PUBLIC_FONT_PATH}?v=ec44f36e057a" as="font" type="font/woff2" crossorigin>
${page.language === GuideLanguage.SimplifiedChinese ? `<link rel="preload" href="${CHINESE_FONT_PATH}" as="font" type="font/woff2" crossorigin>` : ""}
<link rel="stylesheet" href="${PUBLIC_FONT_STYLE_PATH}">
<link rel="stylesheet" href="${PUBLIC_THEME_STYLE_PATH}">
<link rel="stylesheet" href="${GUIDE_STYLE_PATH}">
<link rel="stylesheet" href="${GROWTH_DESKTOP_STYLE_PATH}">
</head><body data-growth-desktop data-ui-desktop-pattern="${publicPattern(page.path)}">
${publicUiScope(`<header>${publicDesktopNavigation({ label: page.navigation, language: page.language, currentHref: page.path, brandLabel: page.language === GuideLanguage.English ? "Xprite showcase" : "Xprite 设备演示", brandHref: SHOWCASE_PAGES[page.language].path, brandImage: "/menu-icon.svg", links })}</header>
<main class="${mainClass}" data-public-desktop>${body}</main>`)}
</body></html>\n`;
}

function sitemap(): string {
  const urls = [
    "/",
    ...GUIDES.map((guide) => guide.path),
    ...TOOL_PATHS,
    ...SHOWCASE_PATHS,
    ...ARTICLE_PATHS,
  ];
  const entries = urls.map((path) => {
    const article = ARTICLES.find((item) => item.path === path);
    const translations = GUIDES.some((guide) => guide.path === path)
      ? GUIDES.map((guide) => ({ language: guide.language, path: guide.path }))
      : SHOWCASE_PATHS.includes(path)
        ? Object.entries(SHOWCASE_PAGES).map(([language, page]) => ({ language, path: page.path }))
        : [];
    const alternates = translations.length
      ? [...translations, { language: "x-default", path: translations[0].path }]
          .map(
            (item) =>
              `<xhtml:link rel="alternate" hreflang="${item.language}" href="${new URL(item.path, SITE_URL).href}"/>`,
          )
          .join("")
      : "";
    return `  <url><loc>${new URL(path, SITE_URL).href}</loc>${article ? `<lastmod>${article.dateModified}</lastmod>` : ""}${alternates}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join("\n")}\n</urlset>\n`;
}

function robots(indexable: boolean): string {
  return `User-agent: *\nAllow: /\n${indexable ? `Sitemap: ${SITE_URL}sitemap.xml\n` : ""}`;
}

function languageModelIndex(): string {
  return `# Xprite

> Free browser pixel art editor and Aseprite file viewer. Open local sprite projects, edit pixels and animations, and export images.

Xprite is independent of Aseprite. File-format support is not a guarantee of complete compatibility. The viewer processes selected files on the device and exports a current PNG frame or a GIF animation. It limits file size and decoded pixels; large or unsupported projects may be rejected. Keep original project files.

## Applications

- [Pixel art editor](${SITE_URL}): Create and edit sprites, layers, and animation frames.
- [All tools](${new URL(TOOLS_HOME.path, SITE_URL).href}): Free local browser tools with no file uploads.
- [Aseprite viewer](${SITE_URL}tools/viewer/): Inspect local .ase and .aseprite files and export PNG or GIF.
- [Animal Crossing design QR codes](${new URL(ANIMAL_CROSSING_TOOL.path, SITE_URL).href}): Convert PNG images and Aseprite tilemap layers into NookLink QR codes.
- [GIF to Sprite Sheet](${new URL(GIF_SHEET_TOOL.path, SITE_URL).href}): Convert GIF frames into PNG sheets and JSON frame coordinates and timing.

## User guides

- [English guide](${SITE_URL}help/en/): Browser saving, recovery, touch controls, and offline use.
- [中文使用指南](${SITE_URL}help/zh-CN/): 浏览器保存、恢复、触摸操作与离线使用。

## File workflows and comparisons

${ARTICLES.map((article) => `- [${article.title}](${new URL(article.path, SITE_URL).href}): ${article.summary}`).join("\n")}

## Optional

- [Source repository](https://github.com/rhinoc/xprite): Source code and issue reports.
- [Sitemap](${SITE_URL}sitemap.xml): Canonical public pages.
`;
}

function notFoundHtml(): string {
  return applySiteIcons(readFileSync(resolve(PUBLIC_ROOT, "404.html"), "utf8")).replace(
    "<!-- public-not-found -->",
    publicUiScope(
      `<header data-public-error-header>${publicDesktopNavigation({
        label: "Website navigation",
        brandLabel: "Xprite showcase",
        brandHref: SHOWCASE_PAGES[GuideLanguage.English].path,
        links: [
          { label: "Tools", href: TOOLS_HOME.path },
          { label: "Open editor", href: "/" },
          { label: "User guide", href: "/help/en/", icon: "help", end: true },
        ],
      })}</header>` +
        publicDesktopWindow(
          "Xprite",
          publicRichText(
            `<h1 id="error-title">Page not found</h1><p>The address may be incorrect, or the page may have moved.</p>`,
          ) +
            `<nav data-public-error-actions aria-label="Continue">${publicDesktopButton("/showcase/en/", "Go to showcase")}${publicDesktopButton("/", "Open editor")}</nav>`,
          'aria-labelledby="error-title" data-public-error-window',
          "Error 404",
        ),
    ),
  );
}

function isPublishedFile(root: string, pathname: string): boolean {
  const filename = resolve(root, `.${pathname}`);
  return (
    filename.startsWith(`${root}${sep}`) && existsSync(filename) && statSync(filename).isFile()
  );
}

function send(
  response: ServerResponse,
  method: string | undefined,
  type: string,
  body: string | Buffer,
) {
  response.statusCode = SUCCESS_STATUS;
  response.setHeader("Content-Type", type);
  response.setHeader("X-Robots-Tag", "noindex, follow");
  response.end(method === HEAD_METHOD ? undefined : body);
}

function decodedPath(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return "";
  }
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction,
  paths: string[],
  routingData: { redirects: Record<string, string>; notFoundHtml: string },
) {
  let forwarded = false;
  const routing = createPublicMiddleware({
    paths,
    ...routingData,
  });
  const result = routing({
    request: new Request(new URL(request.url ?? "/", "http://localhost"), {
      method: request.method,
    }),
    next: () => {
      forwarded = true;
      next();
      return new Response(null, { status: FORWARDED_STATUS });
    },
  });
  if (forwarded) return;
  response.statusCode = result.status;
  result.headers.forEach((value, key) => response.setHeader(key, value));
  response.end(request.method === HEAD_METHOD ? undefined : await result.text());
}

function developmentRoutes(
  server: ViteDevServer,
  ui: Awaited<ReturnType<typeof createPublicUiRenderer>>,
) {
  const proxyRoutes = Object.keys(developmentSiteProxy(DevelopmentApp.Growth)).map(
    (pattern) => new RegExp(pattern),
  );
  const controls = (pathname: string, html: string) =>
    server.transformIndexHtml(
      pathname,
      html.replace("</body>", '<script type="module" src="/src/public-main.tsx"></script></body>'),
    );
  let pendingUi: Promise<void> | undefined;
  let uiDirty = false;
  server.watcher.add([...ui.files]);
  let resources: Map<string, string> | undefined;
  let routingData: { redirects: Record<string, string>; notFoundHtml: string } | undefined;
  const guidePages = new Map<GuideLanguage, string>();
  const comparisonPages = new Map<string, string>();
  let comparisonCss: string | undefined;
  const invalidate = (_event: string, filename: string) => {
    if (ui.files.has(filename)) {
      uiDirty = true;
      guidePages.clear();
      comparisonPages.clear();
      routingData = undefined;
      // Public documents embed theme tokens and markup in HTML, outside React HMR.
      server.ws.send({ type: "custom", event: "public-ui:invalidate" });
    }
    if (filename.startsWith(`${GUIDE_ROOT}${sep}`)) {
      resources = undefined;
      guidePages.clear();
    }
    if (filename.startsWith(`${ARTICLE_CONTENT_ROOT}${sep}`)) {
      comparisonPages.clear();
      comparisonCss = undefined;
    }
    if (filename === REDIRECTS_FILE || filename === resolve(PUBLIC_ROOT, "404.html"))
      routingData = undefined;
  };
  server.watcher.add([GUIDE_ROOT, ARTICLE_CONTENT_ROOT, REDIRECTS_FILE]);
  server.watcher.on("all", invalidate);
  server.httpServer?.once("close", () => server.watcher.off("all", invalidate));
  server.middlewares.use(
    (request: IncomingMessage, response: ServerResponse, next: Connect.NextFunction) => {
      const handle = async () => {
        if (proxyRoutes.some((route) => route.test(request.url ?? "/"))) return next();
        const url = new URL(request.url ?? "/", "http://localhost");
        const pathname = decodedPath(
          url.pathname.startsWith(GROWTH_DEVELOPMENT_BASE)
            ? `/${url.pathname.slice(GROWTH_DEVELOPMENT_BASE.length)}`
            : url.pathname,
        );
        const nextVite = () => {
          if (!url.pathname.startsWith(GROWTH_DEVELOPMENT_BASE))
            request.url = `${GROWTH_DEVELOPMENT_BASE.slice(0, -1)}${request.url}`;
          next();
        };
        if (uiDirty && !pendingUi) {
          uiDirty = false;
          pendingUi = createPublicUiRenderer()
            .then((updated) => {
              ui = updated;
              server.watcher.add([...ui.files]);
            })
            .catch((error) => {
              uiDirty = true;
              throw error;
            })
            .finally(() => {
              pendingUi = undefined;
            });
        }
        await pendingUi;
        response.setHeader("X-Robots-Tag", "noindex, follow");
        if (SHOWCASE_PATHS.includes(pathname)) {
          const language = Object.entries(SHOWCASE_PAGES).find(
            ([, page]) => page.path === pathname,
          )![0] as keyof typeof SHOWCASE_PAGES;
          const template = readFileSync(resolve(APP_ROOT, `.${SHOWCASE_HTML_PATH}`), "utf8");
          const html = await server.transformIndexHtml(
            pathname,
            applyShowcaseSearchMetadata(template, language, false),
          );
          return send(response, request.method, HTML_TYPE, html);
        }
        if (pathname.startsWith(PUBLIC_UI_ASSET_PREFIX)) {
          const asset = ui.assets.get(pathname.slice(PUBLIC_UI_ASSET_PREFIX.length));
          if (asset) return send(response, request.method, asset.type, asset.bytes);
        }
        if (DEVELOPMENT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return nextVite();
        if (pathname.startsWith("/assets/") && isPublishedFile(APP_ROOT, pathname))
          return nextVite();
        if (ARTICLE_PATHS.includes(pathname)) {
          let html = comparisonPages.get(pathname);
          if (html === undefined) {
            html = articleHtml(pathname, false);
            comparisonPages.set(pathname, html);
          }
          return send(response, request.method, HTML_TYPE, await controls(pathname, html));
        }
        if (pathname === ARTICLE_STYLE_PATH) {
          comparisonCss ??= articleStylesheet();
          return send(response, request.method, CONTENT_TYPES[".css"], comparisonCss);
        }
        if (pathname === GROWTH_DESKTOP_STYLE_PATH) {
          return send(response, request.method, CONTENT_TYPES[".css"], ui.css);
        }
        const guide = GUIDES.find((item) => item.path === pathname);
        if (guide) {
          let html = guidePages.get(guide.language);
          if (html === undefined) {
            html = guideHtml(guide, false);
            guidePages.set(guide.language, html);
          }
          return send(response, request.method, HTML_TYPE, await controls(pathname, html));
        }
        resources ??= publicPageResources();
        const resource = resources.get(pathname);
        if (resource)
          return send(
            response,
            request.method,
            CONTENT_TYPES[extname(resource)],
            request.method === HEAD_METHOD ? "" : await readFile(resource),
          );
        if (pathname === "/robots.txt")
          return send(response, request.method, "text/plain; charset=utf-8", robots(false));
        if (pathname === "/llms.txt")
          return send(response, request.method, "text/plain; charset=utf-8", languageModelIndex());
        if (pathname === "/sitemap.xml")
          return send(response, request.method, "application/xml; charset=utf-8", sitemap());
        const paths = [
          ...APP_PATHS,
          ...resources.keys(),
          ...GUIDES.map((item) => item.path),
          ...ARTICLE_PATHS,
          ARTICLE_STYLE_PATH,
        ];
        if (pathname !== ASSET_MANIFEST_PATH && isPublishedFile(PUBLIC_ROOT, pathname))
          return nextVite();
        routingData ??= {
          redirects: publicRedirects(),
          notFoundHtml: await controls("/404.html", notFoundHtml()),
        };
        await routeRequest(request, response, next, paths, routingData);
      };
      void handle().catch(next);
    },
  );
}

/** Growth owns public pages; the editor consumes only the shared guide content. */
export async function growthPublicPages(): Promise<Plugin> {
  const ui = await createPublicUiRenderer();
  let configuration: ResolvedConfig;
  let enabled = false;
  let indexable = false;
  return {
    name: "growth-public-pages",
    configResolved(config) {
      configuration = config;
      enabled = process.env.XPRITE_DISTRIBUTION !== "itch";
      indexable = config.command === "build" && process.env.EDGEONE_ENV !== "preview";
    },
    configureServer(server) {
      if (enabled) developmentRoutes(server, ui);
    },
    configurePreviewServer(server) {
      if (!enabled) return;
      const root = resolve(configuration.root, configuration.build.outDir);
      const routingData = {
        redirects: publicRedirects(),
        notFoundHtml: readFileSync(resolve(root, "404.html"), "utf8"),
      };
      server.middlewares.use((request, response, next) => {
        response.setHeader("X-Robots-Tag", "noindex, follow");
        const url = new URL(request.url ?? "/", "http://localhost");
        const pathname = decodedPath(url.pathname);
        if (SHOWCASE_PATHS.includes(pathname)) {
          request.url = `${pathname}index.html${url.search}`;
          return next();
        }
        if (ARTICLE_PATHS.includes(pathname)) {
          const filename = resolve(root, `.${pathname}`, "index.html");
          if (isPublishedFile(root, `${pathname}index.html`)) {
            void readFile(filename, "utf8")
              .then((html) =>
                send(response, request.method, HTML_TYPE, applyPageSearchMetadata(html, false)),
              )
              .catch(next);
            return;
          }
        }
        const paths = [...APP_PATHS, VIEWER_PATH];
        if (
          isPublishedFile(root, pathname) ||
          (pathname.endsWith("/") && isPublishedFile(root, `${pathname}index.html`))
        )
          paths.push(pathname);
        void routeRequest(request, response, next, paths, routingData).catch(next);
      });
    },
    async closeBundle() {
      if (!enabled || configuration.command !== "build") return;
      const output = resolve(configuration.root, configuration.build.outDir);
      const controlsHtml = readFileSync(resolve(output, "controls/index.html"), "utf8");
      const controlAssets = [
        ...controlsHtml.matchAll(
          /<(?:script\b[^>]*\bsrc=[^>]*><\/script>|link\b[^>]*rel="(?:stylesheet|modulepreload)"[^>]*>)/g,
        ),
      ]
        .map((match) => match[0])
        .join("\n");
      const controls = (html: string) => html.replace("</head>", `${controlAssets}\n</head>`);
      // The asset workspace manifest is source configuration, not a public resource.
      await rm(resolve(output, `.${ASSET_MANIFEST_PATH}`), { force: true });
      const showcaseHtml = readFileSync(resolve(output, `.${SHOWCASE_HTML_PATH}`), "utf8");
      for (const [language, page] of Object.entries(SHOWCASE_PAGES)) {
        const filename = resolve(output, `.${page.path}`, "index.html");
        await mkdir(dirname(filename), { recursive: true });
        await writeFile(
          filename,
          applyShowcaseSearchMetadata(
            showcaseHtml,
            language as keyof typeof SHOWCASE_PAGES,
            indexable,
          ),
        );
      }
      for (const guide of GUIDES) {
        const filename = resolve(output, `.${guide.path}`, "index.html");
        await mkdir(dirname(filename), { recursive: true });
        await writeFile(filename, controls(guideHtml(guide, indexable)));
      }
      for (const path of ARTICLE_PATHS) {
        const filename = resolve(output, `.${path}`, "index.html");
        await mkdir(dirname(filename), { recursive: true });
        await writeFile(filename, controls(articleHtml(path, indexable)));
      }
      await writeFile(resolve(output, `.${ARTICLE_STYLE_PATH}`), articleStylesheet());
      const desktopStylesheetFile = resolve(output, `.${GROWTH_DESKTOP_STYLE_PATH}`);
      await mkdir(dirname(desktopStylesheetFile), { recursive: true });
      await writeFile(desktopStylesheetFile, ui.css);
      for (const [name, asset] of ui.assets) {
        const filename = resolve(output, `.${PUBLIC_UI_ASSET_PREFIX}${name}`);
        await mkdir(dirname(filename), { recursive: true });
        await writeFile(filename, asset.bytes);
      }
      const notFoundFile = resolve(output, "404.html");
      await writeFile(notFoundFile, controls(notFoundHtml()));
      await rm(resolve(output, "controls"), { recursive: true, force: true });
      for (const [path, source] of publicPageResources()) {
        const filename = resolve(output, `.${path}`);
        await mkdir(dirname(filename), { recursive: true });
        await cp(source, filename);
      }
      await writeFile(resolve(output, "robots.txt"), robots(indexable));
      await writeFile(resolve(output, "llms.txt"), languageModelIndex());
      if (indexable) await writeFile(resolve(output, "sitemap.xml"), sitemap());
      else await rm(resolve(output, "sitemap.xml"), { force: true });
    },
  };
}
