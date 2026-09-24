import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

import { packageLocalAliases } from "../../infra/package-local-aliases.ts";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(packageRoot, "../..");

export default defineConfig({
  root: packageRoot,
  resolve: { tsconfigPaths: true },
  plugins: [packageLocalAliases()],
  build: {
    outDir: resolve(repositoryRoot, "dist/core"),
    emptyOutDir: true,
    copyPublicDir: false,
    lib: {
      entry: resolve(packageRoot, "src/index.ts"),
      formats: ["es", "cjs"],
      fileName: (format) => (format === "es" ? "index.js" : "index.cjs"),
    },
  },
});
