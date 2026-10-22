import { defineConfig } from "vite";

import { miniToolConfig } from "./shared/build/vite-config.ts";

/** One tool per build: `XHS_MINITOOL=<tool>`, set by `shared/build/build.mjs`. */
export default defineConfig(miniToolConfig(process.env.XHS_MINITOOL ?? "pixelate"));
