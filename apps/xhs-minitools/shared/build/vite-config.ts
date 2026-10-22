import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { zipSync } from "fflate";
import type { Plugin, UserConfig } from "vite";

import { packageLocalAliases } from "../../../../infra/package-local-aliases.ts";
import { siteTelemetryDefines } from "../../../../infra/site-telemetry.ts";
import { xhsAudit } from "./audit.ts";
import { lowerMiniToolCss } from "./legacy-css.ts";

/**
 * One mini tool as a Xiaohongshu mini-tool package: one offline HTML page at the ZIP root with a
 * classic (non-module) ES2017 script and relative asset paths. Chrome 61 is the oldest web view
 * the container supports.
 */
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const packages = resolve(appRoot, "../../packages");
const LEGACY_TARGET = "chrome61";

function packageFiles(directory: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of readdirSync(directory, { withFileTypes: true, recursive: true }))
    if (entry.isFile()) {
      const path = resolve(entry.parentPath, entry.name);
      files[relative(directory, path).split("\\").join("/")] = readFileSync(path);
    }
  return files;
}

/** The upload for the Xiaohongshu developer platform, with index.html at the archive root. */
function zipPackage(outDir: string, zipPath: string): Plugin {
  return {
    name: "xprite-minitool-zip",
    apply: "build",
    closeBundle() {
      writeFileSync(zipPath, zipSync(packageFiles(outDir), { level: 9 }));
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

/** Workspace packages from source; fonts and patterns from the UI package's assets. */
const aliases = [
  ["@xprite/ui/fonts/", "ui/assets/fonts/"],
  ["@xprite/ui/patterns/", "ui/assets/patterns/"],
  ["@xprite/ui/", "ui/src/"],
  ["@xprite/editor-ui/", "editor-ui/src/"],
  ["@xprite/editor-core/", "editor-core/src/"],
  ["@xprite/bedrock/", "bedrock/"],
].map(([find, path]) => ({ find, replacement: `${resolve(packages, path)}/` }));

/** The tools under `tools/`, each a folder with its own `index.html`. */
function miniTools(): string[] {
  return readdirSync(resolve(appRoot, "tools"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Builds `tools/<tool>` into `dist/<tool>/` and `dist/<tool>.zip`. */
export function miniToolConfig(tool: string): UserConfig {
  if (!miniTools().includes(tool)) throw new Error(`No mini tool "${tool}" in tools/.`);
  const root = resolve(appRoot, "tools", tool);
  const outDir = resolve(appRoot, "dist", tool);
  return {
    root,
    base: "./",
    define: siteTelemetryDefines(),
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
      xhsAudit(),
      zipPackage(outDir, resolve(appRoot, "dist", `${tool}.zip`)),
    ],
    resolve: { alias: aliases },
    experimental: {
      // Relative to index.html at the package root, without module-only `import.meta.url`.
      renderBuiltUrl: (filename, { hostType }) => (hostType === "js" ? filename : undefined),
    },
    build: {
      outDir,
      emptyOutDir: true,
      target: ["es2017", LEGACY_TARGET],
      cssTarget: LEGACY_TARGET,
      modulePreload: false,
      cssCodeSplit: false,
      assetsInlineLimit: 0,
      reportCompressedSize: false,
      rolldownOptions: {
        input: resolve(root, "index.html"),
        output: { format: "iife", codeSplitting: false },
      },
    },
  };
}
