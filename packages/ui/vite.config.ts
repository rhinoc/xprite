import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { packageLocalAliases } from "../../infra/package-local-aliases.ts";

const packageRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: packageRoot,
  plugins: [packageLocalAliases(), react()],
  build: {
    outDir: resolve(packageRoot, "dist"),
    emptyOutDir: true,
    copyPublicDir: false,
    cssCodeSplit: false,
    lib: {
      entry: {
        ui: resolve(packageRoot, "src/index.ts"),
        assets: resolve(packageRoot, "src/assets.ts"),
        canvas: resolve(packageRoot, "src/canvas.ts"),
        cursor: resolve(packageRoot, "src/cursor.ts"),
        popover: resolve(packageRoot, "src/popover.ts"),
        utils: resolve(packageRoot, "src/utils.ts"),
      },
      name: "XpriteUI",
      fileName: (_format, entryName) => `${entryName}.js`,
      cssFileName: "style",
      formats: ["es"],
    },
    rolldownOptions: {
      external: ["react", "react-dom", "react/jsx-runtime", "clsx"],
      output: {
        codeSplitting: true,
      },
    },
  },
});
