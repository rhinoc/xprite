import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { Plugin } from "vite";

import { versionOutputDirectory } from "../../../infra/content-versions.ts";
import { OFFLINE_SHELL_PREFIX, writeOfflineManifest } from "./offline-manifest.ts";

const INDEX_FILENAME = "index.html";
const HASH_ALGORITHM = "sha256";

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
      // Version stable-name references first: the precache integrity covers the final bytes.
      await versionOutputDirectory(outputDirectory);
      const html = await readFile(resolve(outputDirectory, INDEX_FILENAME), "utf8");
      // Deployment rewrites index metadata. Keep the cached editor shell immutable.
      const shellHash = createHash(HASH_ALGORITHM).update(html).digest("hex");
      const shell = `${OFFLINE_SHELL_PREFIX}${shellHash}.html`;
      await writeFile(resolve(outputDirectory, shell), html);
      // Later steps (telemetry source map injection) rewrite JS bytes. `seal-editor-offline`
      // recomputes this manifest after them; the build must never ship an unsealed one.
      await writeOfflineManifest(outputDirectory, shell);
    },
  };
}
