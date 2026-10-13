import { readFile } from "node:fs/promises";

import type { Loader, Plugin } from "esbuild";

/**
 * Tests that bundle sources with esbuild need the same asset handling Vite gives the app:
 * `?raw` imports become strings, `?url` imports become data URLs, and fonts/images/styles get a loader.
 */
export const testAssetLoaders: Record<string, Loader> = {
  ".webp": "dataurl",
  ".png": "dataurl",
  ".svg": "text",
  ".woff2": "dataurl",
  ".css": "empty",
};

export const viteAssetImports: Plugin = {
  name: "vite-asset-imports",
  setup(build) {
    build.onResolve({ filter: /\?(raw|url)$/ }, async ({ path, resolveDir, kind, importer }) => {
      const query = path.slice(path.lastIndexOf("?") + 1);
      const resolved = await build.resolve(path.slice(0, path.lastIndexOf("?")), {
        resolveDir,
        kind,
        importer,
      });
      if (resolved.errors.length) return { errors: resolved.errors };
      return { path: resolved.path, namespace: `vite-${query}` };
    });
    build.onLoad({ filter: /.*/, namespace: "vite-raw" }, async ({ path }) => ({
      contents: await readFile(path, "utf8"),
      loader: "text",
    }));
    build.onLoad({ filter: /.*/, namespace: "vite-url" }, async ({ path }) => ({
      contents: await readFile(path),
      loader: "dataurl",
    }));
  },
};
