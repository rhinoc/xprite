import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import {
  DEVELOPMENT_PORTS,
  DevelopmentApp,
  developmentServerIdentity,
  developmentSiteProxy,
} from "../../infra/dev-site.ts";
import { packageLocalAliases } from "../../infra/package-local-aliases.ts";
import { publicPackageAssets } from "../../infra/public-package-assets.ts";
import { ssgScopedName } from "../../infra/react-ssg-style-names.ts";
import { siteHtml } from "../../infra/site-html.ts";
import { toolsStartupPages } from "./build/startup-pages.ts";

const root = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(root, "../..");
const uiSource = resolve(repositoryRoot, "packages/ui/src");
const PREVIEW_PORT = 4176;
const TOOLS_BASE_PATH = "/tools/";
const VIEWER_PATH = "/tools/viewer/";
const ANIMAL_CROSSING_PATH = "/tools/animal-crossing-qr/";
const GIF_PATH = "/tools/gif-to-sprite-sheet/";

export default defineConfig(({ command }) => ({
  root,
  appType: "mpa",
  base: TOOLS_BASE_PATH,
  publicDir: false,
  css: { modules: { generateScopedName: ssgScopedName } },
  plugins: [
    developmentServerIdentity(DevelopmentApp.Tools, repositoryRoot),
    packageLocalAliases(),
    siteHtml(),
    publicPackageAssets(import.meta.url, "@xprite/site-assets", ["menu-icon.svg"]),
    toolsStartupPages(),
    react(),
    {
      name: "tools-public-entries",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const url = new URL(request.url ?? "/", "http://localhost");
          response.setHeader("X-Robots-Tag", "noindex, follow");
          for (const path of [TOOLS_BASE_PATH, VIEWER_PATH, GIF_PATH, ANIMAL_CROSSING_PATH]) {
            if (url.pathname === path.slice(0, -1) || url.pathname === `${path}index.html`) {
              response.writeHead(301, { Location: `${path}${url.search}` });
              response.end();
              return;
            }
          }
          next();
        });
      },
      transformIndexHtml: {
        order: "post",
        handler(html) {
          return command === "build" && process.env.EDGEONE_ENV !== "preview"
            ? html
            : html
                .replace('content="index, follow"', 'content="noindex, follow"')
                .replace(/\s*<link\b[^>]*rel="canonical"[^>]*>/, "");
        },
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: "@xprite/ui/pattern-data",
        replacement: resolve(repositoryRoot, "packages/ui/assets/patterns/macintosh/catalog.json"),
      },
      {
        find: /^@xprite\/growth-content\/tools$/,
        replacement: resolve(repositoryRoot, "apps/growth/content/tools/index.ts"),
      },
      {
        find: /^@xprite\/editor-ui$/,
        replacement: resolve(repositoryRoot, "packages/editor-ui/src/index.ts"),
      },
      {
        find: "@xprite/editor-ui/",
        replacement: `${resolve(repositoryRoot, "packages/editor-ui/src")}/`,
      },
      {
        find: /^@xprite\/ui\/style\.css$/,
        replacement: resolve(repositoryRoot, "packages/ui/dist/style.css"),
      },
      { find: /^@xprite\/ui$/, replacement: `${uiSource}/index.ts` },
      { find: "@xprite/ui/", replacement: `${uiSource}/` },
      {
        find: /^@xprite\/editor-core$/,
        replacement: resolve(repositoryRoot, "packages/editor-core/src/index.ts"),
      },
      {
        find: "@xprite/editor-core/",
        replacement: `${resolve(repositoryRoot, "packages/editor-core/src")}/`,
      },
      { find: "@xprite/bedrock/", replacement: `${resolve(repositoryRoot, "packages/bedrock")}/` },
    ],
  },
  server: {
    host: "0.0.0.0",
    port: DEVELOPMENT_PORTS[DevelopmentApp.Tools],
    strictPort: true,
    fs: { allow: [repositoryRoot] },
    proxy: developmentSiteProxy(DevelopmentApp.Tools),
  },
  preview: { host: "0.0.0.0", port: PREVIEW_PORT, strictPort: true },
  build: {
    outDir: resolve(root, "dist"),
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        animalCrossing: resolve(root, "animal-crossing-qr/index.html"),
        toolsHome: resolve(root, "index.html"),
        viewer: resolve(root, "viewer/index.html"),
        gifToSpriteSheet: resolve(root, "gif-to-sprite-sheet/index.html"),
      },
    },
  },
}));
