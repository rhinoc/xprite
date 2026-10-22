import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { zipSync } from "fflate";
import { defineConfig, type Plugin, type UserConfig } from "vite";

import { packageLocalAliases } from "../../infra/package-local-aliases.ts";
import { lowerMiniToolCss } from "./build/minitool-legacy-css.ts";
import toolsConfig from "./vite.config.ts";

/**
 * The pixelate tool as a Xiaohongshu mini-tool package: one offline HTML page at the ZIP root
 * with a classic (non-module) ES2017 script and relative asset paths. Chrome 61 is the oldest
 * web view the container supports.
 */
const root = dirname(fileURLToPath(import.meta.url));
const site = (toolsConfig as (env: { command: "build"; mode: string }) => UserConfig)({
  command: "build",
  mode: "production",
});
const LEGACY_TARGET = "chrome61";
const OUT_DIR = resolve(root, "dist-minitool");
/** The upload for the Xiaohongshu developer platform, with index.html at the archive root. */
const ZIP_PATH = resolve(root, "dist-minitool.zip");

function packageFiles(directory: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of readdirSync(directory, { withFileTypes: true, recursive: true }))
    if (entry.isFile()) {
      const path = resolve(entry.parentPath, entry.name);
      files[relative(directory, path).split("\\").join("/")] = readFileSync(path);
    }
  return files;
}

function zipPackage(): Plugin {
  return {
    name: "xprite-minitool-zip",
    apply: "build",
    closeBundle() {
      writeFileSync(ZIP_PATH, zipSync(packageFiles(OUT_DIR), { level: 9 }));
    },
  };
}

/** Chrome 61 fallbacks for the final stylesheet; see {@link lowerMiniToolCss}. */
function legacyStyles(): Plugin {
  return {
    name: "xprite-minitool-legacy-styles",
    enforce: "post",
    generateBundle(_, bundle) {
      for (const output of Object.values(bundle))
        if (output.type === "asset" && output.fileName.endsWith(".css"))
          output.source = lowerMiniToolCss(String(output.source));
    },
  };
}

/**
 * The tool renders with the Macintosh theme only; the default Aseprite theme's bitmap fonts
 * (about 770 KB) would otherwise ship in the package without ever loading.
 */
function omitAsepriteFonts(): Plugin {
  const empty = "\0xprite-minitool-empty.css";
  return {
    name: "xprite-minitool-omit-aseprite-fonts",
    enforce: "pre",
    resolveId: (source) => (source.endsWith("/fonts/aseprite/fonts.css") ? empty : undefined),
    load: (id) => (id === empty ? "" : undefined),
  };
}

/** Vite emits module scripts; the container loads classic scripts only. */
function classicScripts(): Plugin {
  return {
    name: "xprite-minitool-classic-scripts",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler: (html) =>
        html
          .replace(/<link rel="modulepreload"[^>]*>\s*/g, "")
          .replace(
            /<script type="module" crossorigin src="([^"]+)"><\/script>/g,
            '<script defer src="$1"></script>',
          )
          .replace(/ crossorigin(?=[ >])/g, ""),
    },
  };
}

export default defineConfig({
  root: resolve(root, "xhs-minitool"),
  base: "./",
  define: site.define,
  publicDir: false,
  css: {
    modules: { generateScopedName: "[local]_[hash:base64:6]" },
  },
  plugins: [
    omitAsepriteFonts(),
    packageLocalAliases(),
    react(),
    classicScripts(),
    legacyStyles(),
    zipPackage(),
  ],
  resolve: site.resolve,
  experimental: {
    // Relative to index.html at the package root, without module-only `import.meta.url`.
    renderBuiltUrl: (filename, { hostType }) => (hostType === "js" ? filename : undefined),
  },
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    target: ["es2017", LEGACY_TARGET],
    cssTarget: LEGACY_TARGET,
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    reportCompressedSize: false,
    rolldownOptions: {
      input: resolve(root, "xhs-minitool/index.html"),
      output: { format: "iife", codeSplitting: false },
    },
  },
});
