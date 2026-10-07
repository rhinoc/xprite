import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Plugin } from "vite";

const WORKER_FILENAME = "sw.js";
const INDEX_FILENAME = "index.html";
const OFFLINE_SHELL_PREFIX = "editor-offline-";
const BUILD_PLACEHOLDER = "const OFFLINE_BUILD = null;";
const OFFLINE_RESOURCE_PATTERN =
  /\.(?:js|mjs|css|json|webmanifest|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|wasm|bin|icc|ase|aseprite|gpl|pal)$/i;
const HASH_ALGORITHM = "sha256";

interface OfflineEntry {
  url: string;
  integrity: string;
}

async function outputFiles(directory: string, prefix = ""): Promise<string[]> {
  const files = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    files.map(async (file) => {
      const relative = `${prefix}${file.name}`;
      if (file.isDirectory()) return outputFiles(resolve(directory, file.name), `${relative}/`);
      return file.isFile() ? [relative] : [];
    }),
  );
  return nested.flat();
}

export function editorOffline(outputDirectory: string): Plugin {
  let production = false;
  return {
    name: "xprite-editor-offline",
    apply: "build",
    configResolved(config) {
      production = config.isProduction;
    },
    async writeBundle() {
      if (!production) return;
      const workerPath = resolve(outputDirectory, WORKER_FILENAME);
      const [workerSource, html, files] = await Promise.all([
        readFile(workerPath, "utf8"),
        readFile(resolve(outputDirectory, INDEX_FILENAME), "utf8"),
        outputFiles(outputDirectory),
      ]);
      if (!workerSource.includes(BUILD_PLACEHOLDER))
        throw new Error("Missing editor offline worker build placeholder");

      // Deployment rewrites index metadata. Keep the cached editor shell immutable.
      const shellHash = createHash(HASH_ALGORITHM).update(html).digest("hex");
      const shell = `${OFFLINE_SHELL_PREFIX}${shellHash}.html`;
      await writeFile(resolve(outputDirectory, shell), html);
      const resources = files
        .filter(
          (file) =>
            file !== WORKER_FILENAME &&
            !file.startsWith("LICENSES/") &&
            !file.startsWith(OFFLINE_SHELL_PREFIX) &&
            !file.endsWith(".map") &&
            (file.startsWith("assets/") || OFFLINE_RESOURCE_PATTERN.test(file)),
        )
        .concat(shell)
        .sort();
      const entries: OfflineEntry[] = await Promise.all(
        resources.map(async (file) => ({
          url: file,
          integrity: `${HASH_ALGORITHM}-${createHash(HASH_ALGORITHM)
            .update(await readFile(resolve(outputDirectory, file)))
            .digest("base64")}`,
        })),
      );
      const version = createHash(HASH_ALGORITHM)
        .update(workerSource)
        .update(JSON.stringify(entries))
        .digest("hex");
      await writeFile(
        workerPath,
        workerSource.replace(
          BUILD_PLACEHOLDER,
          `const OFFLINE_BUILD = ${JSON.stringify({ version, shell, entries })};`,
        ),
      );
    },
  };
}
