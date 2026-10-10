import { existsSync, readFileSync, statSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { Connect, Plugin, ResolvedConfig, ViteDevServer } from "vite";

import {
  DevelopmentApp,
  GROWTH_DEVELOPMENT_BASE,
  developmentSiteProxy,
} from "../../../infra/dev-site.ts";
import { applySiteIcons } from "../../../infra/site-html.ts";
import { ARTICLE_PATHS } from "../content/articles/index.ts";
import { SHOWCASE_PAGES } from "../content/showcase/pages.ts";
import { localizedSiteHref, PublicLanguage } from "../content/site/language.ts";
import { showcaseLabel } from "../content/site/navigation.ts";
import { PLANNED_PAGES, SITE_REDIRECTS } from "../content/site/pages.ts";
import { TOOLS_HOME } from "../content/tools/index.ts";
import { ARTICLE_CONTENT_ROOT, articleHtml } from "./pages/article-pages.ts";
import { GUIDE_STYLE_PATH, CHINESE_FONT_PATH } from "./pages/document-resources.ts";
import { GUIDES, GUIDE_ROOT, guideHtml, guideImageResources } from "./pages/guide-pages.ts";
import { plannedPageHtml } from "./pages/planned-pages.ts";
import {
  PUBLIC_THEME_STYLE_PATH,
  PUBLIC_FONT_STYLE_PATH,
  PUBLIC_FONT_PATH,
  PUBLIC_MINI_FONT_PATH,
  GROWTH_DESKTOP_STYLE_PATH,
  PUBLIC_HELP_ICON_PATH,
  PUBLIC_LANGUAGE_ICON_PATH,
  publicDesktopNavigation,
  publicNotFound,
  publicUiScope,
  publicSiteFooter,
} from "./public-theme.ts";
import { createPublicMiddleware } from "./routing/public-routing.ts";
import { sitemap, robots, languageModelIndex } from "./seo/discovery.ts";
import { applyPageSearchMetadata } from "./seo/index.ts";
import { applyShowcaseSearchMetadata } from "./seo/showcase-seo.ts";
import { createPublicUiRenderer, PUBLIC_UI_ASSET_PREFIX } from "./static-ui-renderer.ts";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const APP_ROOT = resolve(REPOSITORY_ROOT, "apps/growth");
const CONTENT_ROOT = resolve(APP_ROOT, "content");
const PUBLIC_ROOT = resolve(REPOSITORY_ROOT, "apps/growth/public");
const ASSET_MANIFEST_PATH = "/package.json";
const REDIRECTS_FILE = resolve(REPOSITORY_ROOT, "edgeone.json");
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
function publicRedirects(): Record<string, string> {
  const configuration = JSON.parse(readFileSync(REDIRECTS_FILE, "utf8"));
  return {
    ...Object.fromEntries(
      configuration.redirects
        .filter((item: { source: string }) => item.source.startsWith("/"))
        .map((item: { source: string; destination: string }) => [item.source, item.destination]),
    ),
    ...SITE_REDIRECTS,
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
    [
      "/fusion-pixel/fusion-pixel-10px-zh-hans.woff2",
      resolve(
        REPOSITORY_ROOT,
        "packages/ui/assets/fonts/fusion-pixel/fusion-pixel-10px-zh-hans.woff2",
      ),
    ],
  ]);
  for (const [path, source] of guideImageResources()) resources.set(path, source);
  return resources;
}

function notFoundHtml(language = PublicLanguage.English): string {
  const text = (en: string, zh: string) =>
    language === PublicLanguage.SimplifiedChinese ? zh : en;
  const template = applySiteIcons(readFileSync(resolve(PUBLIC_ROOT, "404.html"), "utf8"))
    .replace('<html lang="en"', `<html lang="${language}"`)
    .replace("Page not found — Xprite", text("Page not found — Xprite", "找不到页面 — Xprite"));
  const html = template.replace(
    "<!-- public-not-found -->",
    publicUiScope(
      `<header data-public-error-header>${publicDesktopNavigation({
        label: text("Website navigation", "网站导航"),
        language,
        currentHref: "/404.html",
        brandLabel: showcaseLabel(language),
        brandHref: SHOWCASE_PAGES[language].path,
        links: [
          { label: text("Tools", "工具"), href: localizedSiteHref(TOOLS_HOME.path, language) },
          { label: text("Open editor", "打开编辑器"), href: "/" },
          {
            label: text("User guide", "使用指南"),
            href: `/help/${language}/`,
            icon: "help",
            end: true,
          },
          {
            label: language === PublicLanguage.English ? "简体中文" : "English",
            href: `/404.html?lang=${language === PublicLanguage.English ? PublicLanguage.SimplifiedChinese : PublicLanguage.English}`,
            icon: "language",
          },
        ],
      })}</header>` +
        publicNotFound(language) +
        publicSiteFooter(language),
      language,
    ),
  );
  if (language === PublicLanguage.SimplifiedChinese) return html;
  const chineseBody = notFoundHtml(PublicLanguage.SimplifiedChinese).match(
    /<body[^>]*>([\s\S]*?)<\/body>/,
  )![1];
  return html.replace(
    "</body>",
    `<template id="public-chinese-error">${chineseBody}</template><script>{const lang=new URLSearchParams(location.search).get('lang');if(lang==='zh-CN'||(lang!=='en'&&location.pathname.split('/').includes('zh-CN'))){document.documentElement.lang='zh-CN';document.title='找不到页面 — Xprite';document.body.innerHTML=document.getElementById('public-chinese-error').innerHTML}}</script></body>`,
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
  const guidePages = new Map<PublicLanguage, string>();
  const comparisonPages = new Map<string, string>();
  const plannedPages = new Map<string, string>();
  const invalidate = (_event: string, filename: string) => {
    if (ui.files.has(filename)) {
      uiDirty = true;
      guidePages.clear();
      comparisonPages.clear();
      plannedPages.clear();
      routingData = undefined;
      // Public documents embed theme tokens and markup in HTML, outside React HMR.
      server.ws.send({ type: "custom", event: "public-ui:invalidate" });
    }
    if (filename.startsWith(`${GUIDE_ROOT}${sep}`)) {
      resources = undefined;
      guidePages.clear();
    }
    if (filename.startsWith(`${CONTENT_ROOT}${sep}`)) {
      plannedPages.clear();
      routingData = undefined;
    }
    if (filename.startsWith(`${ARTICLE_CONTENT_ROOT}${sep}`)) {
      comparisonPages.clear();
    }
    if (filename === REDIRECTS_FILE || filename === resolve(PUBLIC_ROOT, "404.html"))
      routingData = undefined;
  };
  server.watcher.add([CONTENT_ROOT, REDIRECTS_FILE]);
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
        if (pathname === "/404.html") {
          return send(
            response,
            request.method,
            HTML_TYPE,
            await controls(pathname, notFoundHtml()),
          );
        }
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
        if (PLANNED_PAGES.some((page) => page.path === pathname)) {
          let html = plannedPages.get(pathname);
          if (html === undefined) {
            html = plannedPageHtml(pathname);
            plannedPages.set(pathname, html);
          }
          return send(response, request.method, HTML_TYPE, await controls(pathname, html));
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
          ...PLANNED_PAGES.map((page) => page.path),
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
        if (
          ARTICLE_PATHS.includes(pathname) ||
          PLANNED_PAGES.some((page) => page.path === pathname)
        ) {
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
      for (const page of PLANNED_PAGES) {
        const filename = resolve(output, `.${page.path}`, "index.html");
        await mkdir(dirname(filename), { recursive: true });
        await writeFile(filename, controls(plannedPageHtml(page.path, indexable)));
      }
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
