import { copyFile, cp } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { packageLocalAliases } from "../../infra/package-local-aliases.ts";

const appRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(appRoot, "../..");
const galleryOutput = resolve(appRoot, "dist");
const uiSource = resolve(repositoryRoot, "packages/ui/src");
const uiStylesheet = resolve(repositoryRoot, "packages/ui/dist/style.css");

export default defineConfig({
  root: appRoot,
  resolve: {
    alias: [
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
    packageLocalAliases(),
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
    port: 5174,
    strictPort: true,
    fs: { allow: [repositoryRoot] },
  },
  preview: { host: "0.0.0.0", port: 4174, strictPort: true },
  build: { outDir: galleryOutput, emptyOutDir: true },
});
