import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname } from "node:path";

import type { Plugin } from "vite";

const HEAD_METHOD = "HEAD";
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

/** Publish selected workspace assets at stable URLs without copying source files. */
export function publicPackageAssets(
  importer: string,
  packageName: string,
  filenames: readonly string[],
): Plugin {
  const require = createRequire(importer);
  const resources = new Map(
    filenames.map((filename) => [filename, require.resolve(`${packageName}/${filename}`)]),
  );
  return {
    name: "public-package-assets",
    configureServer(server) {
      server.watcher.add([...resources.values()]);
      server.middlewares.use((request, response, next) => {
        const filename = new URL(request.url ?? "/", "http://localhost").pathname.slice(1);
        const source = resources.get(filename);
        if (!source) return next();
        void readFile(source)
          .then((bytes) => {
            response.setHeader("Content-Type", CONTENT_TYPES[extname(filename)]);
            response.setHeader("Cache-Control", "no-cache");
            response.end(request.method === HEAD_METHOD ? undefined : bytes);
          })
          .catch(next);
      });
    },
    async generateBundle() {
      for (const [fileName, source] of resources) {
        this.emitFile({ type: "asset", fileName, source: await readFile(source) });
      }
    },
  };
}
