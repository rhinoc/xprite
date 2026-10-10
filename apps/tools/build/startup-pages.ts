import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, extname, isAbsolute, resolve } from "node:path";

import type { Plugin, ViteDevServer } from "vite";

import { publicDesktopStartupScript } from "../../../infra/public-desktop-startup.ts";
import type { SsgAsset } from "../../../infra/react-ssg-renderer.ts";
import { prependSiteHeadContent } from "../../../infra/site-html.ts";
import { APPEARANCE_MODE_STORAGE_KEY } from "../../../packages/editor-ui/src/appearance/index.ts";
import { PublicLanguage } from "../../growth/content/site/language.ts";
import {
  TOOLS_HOME,
  VIEWER_TOOL,
  GIF_SHEET_TOOL,
  ANIMAL_CROSSING_TOOL,
  translateToolText,
} from "../../growth/content/tools/index.ts";
import { createSsgRenderer } from "./ssg-renderer.ts";

const ASSET_PATH = "/ssg-assets/";
const PUBLIC_ASSET_PATH = `/tools${ASSET_PATH}`;
const ASSET_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};
const TOOL_BY_ROOT = {
  "tools-root": TOOLS_HOME,
  "viewer-root": VIEWER_TOOL,
  "gif-sheet-root": GIF_SHEET_TOOL,
  "animal-crossing-root": ANIMAL_CROSSING_TOOL,
};
const ROOT_IDS = ["tools-root", "viewer-root", "gif-sheet-root", "animal-crossing-root"];
const jsonForHtml = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c");

/** The HTML and the browser hydrate the same page components and UI controls. */
export function toolsStartupPages(): Plugin {
  let server: ViteDevServer | undefined;
  let renderer: ReturnType<typeof createSsgRenderer> | undefined;
  const assets = new Map<string, SsgAsset>();
  const assetUrl = (filename: string) => {
    const bytes = readFileSync(filename);
    const extension = extname(filename);
    const name = `${createHash("sha256").update(bytes).digest("hex")}${extension}`;
    assets.set(name, { bytes, type: ASSET_TYPES[extension] });
    return `${PUBLIC_ASSET_PATH}${name}`;
  };
  const load = () =>
    (renderer ??= createSsgRenderer().then((result) => {
      for (const [name, asset] of result.assets) assets.set(name, asset);
      server?.watcher.add([...result.files]);
      return result;
    }));
  return {
    name: "tools-startup-pages",
    enforce: "pre",
    transform(code, id) {
      const [filename, query = ""] = id.split("?", 2);
      if (isAbsolute(filename) && ASSET_TYPES[extname(filename)] && !query.includes("raw"))
        return { code: `export default ${JSON.stringify(assetUrl(filename))};`, map: null };
      if (!filename.endsWith(".css")) return;
      // Both critical and runtime CSS keep the same content-addressed original assets.
      return code.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (match, _quote, resource) => {
        if (/^(?:data:|https?:|\/|#)/.test(resource)) return match;
        const target = resolve(dirname(filename), resource.split("?", 1)[0]);
        return ASSET_TYPES[extname(target)] && existsSync(target)
          ? `url("${assetUrl(target)}")`
          : match;
      });
    },
    configureServer(instance) {
      server = instance;
      const invalidate = () => {
        renderer = undefined;
      };
      server.watcher.on("change", invalidate);
      server.watcher.on("add", invalidate);
      server.watcher.on("unlink", invalidate);
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url ?? "/", "http://localhost").pathname.replace(
          /^\/tools\//,
          "/",
        );
        if (!path.startsWith(ASSET_PATH)) return next();
        const asset = assets.get(path.slice(ASSET_PATH.length));
        if (!asset) return next();
        response.setHeader("Content-Type", asset.type);
        response.setHeader("Cache-Control", "no-cache");
        response.end(request.method === "HEAD" ? undefined : asset.bytes);
      });
    },
    transformIndexHtml: {
      order: "post",
      async handler(html) {
        const rootId = ROOT_IDS.find((id) => html.includes(`<div id="${id}">`));
        if (!rootId) return html;
        const runtime = await load();
        const page = await runtime.render(rootId);
        const tool = TOOL_BY_ROOT[rootId as keyof typeof TOOL_BY_ROOT];
        const localeHead = `<script>document.documentElement.lang=new URLSearchParams(location.search).get('lang')==='zh-CN'?'zh-CN':'en'</script>`;
        const localeSwitch = `{const root=document.getElementById(${JSON.stringify(rootId)});const zh=document.documentElement.lang==='zh-CN';const dark=document.documentElement.dataset.toolAppearance==='dark';const template=zh?document.querySelector('template[data-tool-locale="zh-CN-'+(dark?'dark':'light')+'"]'):dark?document.querySelector('template[data-tool-theme="dark"]'):null;if(template)root.innerHTML=template.innerHTML;document.title=zh?${jsonForHtml(translateToolText(tool.title, PublicLanguage.SimplifiedChinese))}:${jsonForHtml(tool.title)};const meta=document.querySelector('meta[name="description"]');if(meta)meta.content=zh?${jsonForHtml(translateToolText(tool.description, PublicLanguage.SimplifiedChinese))}:${jsonForHtml(tool.description)}}`;
        const root = `<div id="${rootId}" data-tool-startup-view>${page.light}</div><template data-tool-theme="dark">${page.dark}</template><template data-tool-locale="zh-CN-light">${page.chineseLight}</template><template data-tool-locale="zh-CN-dark">${page.chineseDark}</template><script id="tool-initial-themes" type="application/json">${jsonForHtml(page.themes)}</script><script id="tool-initial-artwork" type="application/json">${jsonForHtml(page.artwork)}</script><script>${localeSwitch}</script>`;
        const appearance = publicDesktopStartupScript(APPEARANCE_MODE_STORAGE_KEY);
        const bodyStyle = `html[data-tool-appearance="light"]{color-scheme:light;background:${page.themes.light.definition.colors.workspace}}html[data-tool-appearance="dark"]{color-scheme:dark;background:${page.themes.dark.definition.colors.workspace}}`;
        return {
          html: prependSiteHeadContent(html, `${localeHead}<script>${appearance}</script>`)
            .replace('<html lang="en">', '<html lang="en" data-tool-appearance="light">')
            .replace(new RegExp(`<div id="${rootId}">[\\s\\S]*?<\\/div>`), root),
          tags: [
            {
              tag: "style",
              attrs: { "data-tool-ssg-style": "" },
              children: runtime.css + bodyStyle,
              injectTo: "head",
            },
          ],
        };
      },
    },
    async generateBundle() {
      await load();
      for (const [name, asset] of assets)
        this.emitFile({ type: "asset", fileName: `ssg-assets/${name}`, source: asset.bytes });
    },
  };
}
