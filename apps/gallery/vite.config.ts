import { copyFile, cp } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import {
  DEVELOPMENT_PORTS,
  GALLERY_DEVELOPMENT_BASE,
  DevelopmentApp,
  developmentServerIdentity,
  developmentSiteProxy,
} from "../../infra/dev-site.ts";
import { packageLocalAliases } from "../../infra/package-local-aliases.ts";
import { publicPackageAssets } from "../../infra/public-package-assets.ts";
import { siteHtml } from "../../infra/site-html.ts";

const appRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(appRoot, "../..");
const galleryOutput = resolve(appRoot, "dist");
const uiSource = resolve(repositoryRoot, "packages/ui/src");
const uiStylesheet = resolve(repositoryRoot, "packages/ui/dist/style.css");

export default defineConfig({
  root: appRoot,
  base: GALLERY_DEVELOPMENT_BASE,
  resolve: {
    alias: [
      {
        find: "@xprite/ui/pattern-data",
        replacement: resolve(repositoryRoot, "packages/ui/assets/patterns/macintosh/catalog.json"),
      },
      {
        find: /^@xprite\/ui\/style\.css$/,
        replacement: uiStylesheet,
      },
      {
        find: /^@xprite\/ui$/,
        replacement: `${uiSource}/index.ts`,
      },
      {
        find: "@xprite/ui/",
        replacement: `${uiSource}/`,
      },
    ],
  },
  plugins: [
    developmentServerIdentity(DevelopmentApp.Gallery, repositoryRoot),
    packageLocalAliases(),
    siteHtml(),
    publicPackageAssets(import.meta.url, "@xprite/site-assets", ["menu-icon.svg"]),
    react(),
    {
      name: "bundle-gallery-license-notices",
      async closeBundle() {
        await Promise.all([
          copyFile(resolve(repositoryRoot, "LICENSE"), resolve(galleryOutput, "LICENSE")),
          copyFile(
            resolve(repositoryRoot, "ATTRIBUTION.md"),
            resolve(galleryOutput, "ATTRIBUTION.md"),
          ),
          cp(resolve(repositoryRoot, "LICENSES"), resolve(galleryOutput, "LICENSES"), {
            recursive: true,
          }),
        ]);
      },
    },
  ],
  server: {
    host: "0.0.0.0",
    port: DEVELOPMENT_PORTS[DevelopmentApp.Gallery],
    strictPort: true,
    fs: { allow: [repositoryRoot] },
    proxy: developmentSiteProxy(DevelopmentApp.Gallery),
  },
  preview: { host: "0.0.0.0", port: 4174, strictPort: true },
  build: { outDir: galleryOutput, emptyOutDir: true },
});
