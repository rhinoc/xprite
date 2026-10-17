import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, extname, isAbsolute, resolve } from "node:path";

import type { Plugin, ViteDevServer } from "vite";

import { publicDesktopStartupScript } from "../../../infra/public-desktop-startup.ts";
import { cursorStylesheet, type SsgAsset } from "../../../infra/react-ssg-renderer.ts";
import { prependSiteHeadContent, VISUALLY_HIDDEN_STYLE } from "../../../infra/site-html.ts";
import { APPEARANCE_MODE_STORAGE_KEY } from "../../../packages/editor-ui/src/appearance/index.ts";
import { UiColorScheme } from "../../../packages/ui/src/base/theme/theme-types.ts";
import { PUBLIC_LANGUAGES, PublicLanguage } from "../../growth/content/site/language.ts";
import {
  VIEWER_TOOL,
  GIF_SHEET_TOOL,
  PIXELATE_TOOL,
  ANIMAL_CROSSING_TOOL,
  BEADS_TOOL,
  TOOL_HEADING_ID,
  toolHeading,
  translateToolText,
} from "../../growth/content/tools/index.ts";
import { createSsgRenderer } from "./ssg-renderer.ts";

const SITE_LANGUAGE_PREFERENCE_KEY = "xse.ui.language.v1";
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
  "viewer-root": VIEWER_TOOL,
  "gif-sheet-root": GIF_SHEET_TOOL,
  "pixelation-root": PIXELATE_TOOL,
  "animal-crossing-root": ANIMAL_CROSSING_TOOL,
  "beads-root": BEADS_TOOL,
};
const ROOT_IDS = [
  "viewer-root",
  "gif-sheet-root",
  "pixelation-root",
  "animal-crossing-root",
  "beads-root",
];
const jsonForHtml = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c");
const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const THEME_STYLE_ATTRIBUTE = "data-tool-theme-style";
const THEME_STYLE_PATTERN = / style="([^"]{2048,})"/g;
const ATTRIBUTE_ENTITIES: Readonly<Record<string, string>> = {
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
};

/** Split an inline style into declarations, keeping `;` inside quotes and `url()` intact. */
function styleDeclarations(style: string): Map<string, string> {
  const declarations = new Map<string, string>();
  let depth = 0;
  let quote = "";
  let start = 0;
  const add = (end: number) => {
    const declaration = style.slice(start, end);
    const colon = declaration.indexOf(":");
    if (colon > 0)
      declarations.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
    start = end + 1;
  };
  for (let index = 0; index < style.length; index++) {
    const character = style[index];
    if (quote) {
      if (character === "\\") index++;
      else if (character === quote) quote = "";
    } else if (character === '"' || character === "'") quote = character;
    else if (character === "(") depth++;
    else if (character === ")") depth--;
    else if (character === ";" && depth === 0) add(index);
  }
  add(style.length);
  return declarations;
}

/**
 * Each prerendered variant repeats the theme scope's ~50 KB inline custom properties. Move
 * them into one stylesheet rule plus per-theme differences, marked by an attribute; an
 * inline script restores the exact inline styles from those rules before hydration.
 */
function hoistThemeStyles(variants: readonly string[]) {
  const styles: string[] = [];
  const html = variants.map((variant) =>
    variant.replace(THEME_STYLE_PATTERN, (_match, encoded: string) => {
      const style = encoded.replace(
        /&(?:quot|#x27|#39|lt|gt|amp);/g,
        (entity) => ATTRIBUTE_ENTITIES[entity],
      );
      if (!styles.includes(style)) styles.push(style);
      return ` ${THEME_STYLE_ATTRIBUTE}="${styles.indexOf(style)}"`;
    }),
  );
  if (!styles.length) return { html, css: "", restore: "" };
  const base = styleDeclarations(styles[0]);
  const rule = (selector: string, declarations: Iterable<[string, string]>) =>
    `${selector}{${[...declarations].map(([name, value]) => `${name}:${value} !important`).join(";")}}`;
  const css = [
    rule(`[${THEME_STYLE_ATTRIBUTE}]`, base),
    ...styles.slice(1).map((style, index) => {
      const declarations = styleDeclarations(style);
      const changed = [...declarations].filter(([name, value]) => base.get(name) !== value);
      const removed = [...base.keys()]
        .filter((name) => !declarations.has(name))
        .map((name): [string, string] => [name, "initial"]);
      return rule(`[${THEME_STYLE_ATTRIBUTE}="${index + 1}"]`, [...changed, ...removed]);
    }),
  ].join("");
  const restore = `{const rules={};for(const sheet of document.styleSheets){try{for(const rule of sheet.cssRules)if(rule.selectorText&&rule.selectorText.startsWith('[${THEME_STYLE_ATTRIBUTE}'))rules[rule.selectorText]=rule.style.cssText.replace(/ ?!important/g,'')}catch{}}for(const element of document.querySelectorAll('[${THEME_STYLE_ATTRIBUTE}]')){const id=element.getAttribute('${THEME_STYLE_ATTRIBUTE}');element.setAttribute('style',(rules['[${THEME_STYLE_ATTRIBUTE}]']||'')+(id==='0'?'':rules['[${THEME_STYLE_ATTRIBUTE}="'+id+'"]']||''));element.removeAttribute('${THEME_STYLE_ATTRIBUTE}')}}`;
  return { html, css, restore };
}

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
      return {
        ...result,
        cursors: cursorStylesheet(result.cursorVariables, assets, PUBLIC_ASSET_PATH),
      };
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
        const localeHead = `<script>try{const lang=localStorage.getItem(${JSON.stringify(SITE_LANGUAGE_PREFERENCE_KEY)});if(${JSON.stringify(PUBLIC_LANGUAGES)}.includes(lang))document.documentElement.lang=lang}catch{}</script>`;
        const localizedCopy = Object.fromEntries(
          PUBLIC_LANGUAGES.map((language) => [
            language,
            [
              translateToolText(tool.title, language),
              translateToolText(tool.description, language),
              toolHeading(tool, language),
            ],
          ]),
        );
        const localeSwitch = `{const root=document.getElementById(${JSON.stringify(rootId)});const lang=document.documentElement.lang;const copy=${jsonForHtml(localizedCopy)}[lang]||${jsonForHtml(localizedCopy[PublicLanguage.English])};const dark=document.documentElement.dataset.toolAppearance==='dark';const template=lang!=='en'&&document.querySelector('template[data-tool-locale="'+lang+'-'+(dark?'dark':'light')+'"]')||(dark?document.querySelector('template[data-tool-theme="dark"]'):null);if(template)root.innerHTML=template.innerHTML;document.title=copy[0];const meta=document.querySelector('meta[name="description"]');if(meta)meta.content=copy[1];const heading=document.getElementById(${JSON.stringify(TOOL_HEADING_ID)});if(heading)heading.textContent=copy[2]}`;
        // Outside the hydrated root, so React keeps it; the tool UI has no visible page heading.
        const heading = `<h1 id="${TOOL_HEADING_ID}" style="${VISUALLY_HIDDEN_STYLE}">${escapeHtml(toolHeading(tool, PublicLanguage.English))}</h1>`;
        const themed = hoistThemeStyles([
          page.light,
          page.dark,
          ...page.localized.flatMap(({ light, dark }) => [light, dark]),
        ]);
        const [light, dark, ...localizedHtml] = themed.html;
        const localeTemplates = page.localized
          .map(
            ({ language }, index) =>
              `<template data-tool-locale="${language}-light">${localizedHtml[index * 2]}</template><template data-tool-locale="${language}-dark">${localizedHtml[index * 2 + 1]}</template>`,
          )
          .join("");
        const root = `${heading}<div id="${rootId}" data-tool-startup-view>${light}</div><template data-tool-theme="dark">${dark}</template>${localeTemplates}<script id="tool-initial-artwork" type="application/json">${jsonForHtml(page.artwork)}</script><script>${localeSwitch}${themed.restore}</script>`;
        const appearance = publicDesktopStartupScript(APPEARANCE_MODE_STORAGE_KEY);
        const bodyStyle = `html[data-tool-appearance="light"]{color-scheme:light;background:${page.themes[UiColorScheme.Light].definition.colors.workspace}}html[data-tool-appearance="dark"]{color-scheme:dark;background:${page.themes[UiColorScheme.Dark].definition.colors.workspace}}`;
        return {
          html: prependSiteHeadContent(html, `${localeHead}<script>${appearance}</script>`)
            .replace('<html lang="en">', '<html lang="en" data-tool-appearance="light">')
            .replace(new RegExp(`<div id="${rootId}">[\\s\\S]*?<\\/div>`), root),
          tags: [
            {
              tag: "style",
              attrs: { "data-tool-ssg-style": "" },
              children: runtime.css + runtime.cursors + bodyStyle + themed.css,
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
