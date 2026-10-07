import { copyFile, cp } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import {
  DEVELOPMENT_PORTS,
  GROWTH_DEVELOPMENT_BASE,
  DevelopmentApp,
  developmentServerIdentity,
  developmentSiteProxy,
} from "../../infra/dev-site.ts";
import { packageLocalAliases } from "../../infra/package-local-aliases.ts";
import { publicDesktopStartupScript } from "../../infra/public-desktop-startup.ts";
import { ssgScopedName } from "../../infra/react-ssg-style-names.ts";
import { siteHtml } from "../../infra/site-html.ts";
import { growthPublicPages } from "./build/public-pages.ts";
import { growthSeo } from "./build/seo.ts";

const appRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(appRoot, "../..");
const growthOutput = resolve(appRoot, "dist");
const uiSource = resolve(repositoryRoot, "packages/ui/src");
const uiStylesheet = resolve(repositoryRoot, "packages/ui/dist/style.css");
const PREVIEW_PORT = 4175;

export default defineConfig(({ command, isPreview }) => ({
  root: appRoot,
  base: command === "serve" && !isPreview ? GROWTH_DEVELOPMENT_BASE : "/",
  resolve: {
    alias: [
      {
        find: "@xprite/ui/pattern-data",
        replacement: resolve(repositoryRoot, "packages/ui/assets/patterns/macintosh/catalog.json"),
      },
      { find: /^@xprite\/ui\/style\.css$/, replacement: uiStylesheet },
      { find: /^@xprite\/ui$/, replacement: `${uiSource}/index.ts` },
      { find: "@xprite/ui/", replacement: `${uiSource}/` },
    ],
  },
  css: { modules: { generateScopedName: ssgScopedName } },
  plugins: [
    developmentServerIdentity(DevelopmentApp.Growth, repositoryRoot),
    packageLocalAliases(),
    siteHtml(),
    growthSeo(),
    {
      name: "public-desktop-startup",
      transformIndexHtml: {
        order: "post",
        handler() {
          return [
            { tag: "script", children: publicDesktopStartupScript(), injectTo: "head-prepend" },
          ];
        },
      },
    },
    growthPublicPages(),
    react(),
    {
      name: "bundle-growth-license-notices",
      async closeBundle() {
        await Promise.all([
          copyFile(resolve(repositoryRoot, "LICENSE"), resolve(growthOutput, "LICENSE")),
          copyFile(
            resolve(repositoryRoot, "ATTRIBUTION.md"),
            resolve(growthOutput, "ATTRIBUTION.md"),
          ),
          cp(resolve(repositoryRoot, "LICENSES"), resolve(growthOutput, "LICENSES"), {
            recursive: true,
          }),
        ]);
      },
    },
  ],
  server: {
    host: "0.0.0.0",
    port: DEVELOPMENT_PORTS[DevelopmentApp.Growth],
    strictPort: true,
    fs: { allow: [repositoryRoot] },
    proxy: developmentSiteProxy(DevelopmentApp.Growth),
  },
  preview: { host: "0.0.0.0", port: PREVIEW_PORT, strictPort: true },
  build: {
    outDir: growthOutput,
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        showcase: resolve(appRoot, "showcase/index.html"),
        publicControls: resolve(appRoot, "controls/index.html"),
      },
    },
  },
}));
