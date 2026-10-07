import { defineConfig } from "vitest/config";

import { packageLocalAliases } from "./package-local-aliases";

export default defineConfig({
  plugins: [packageLocalAliases()],
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts", "services/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.tmp/**"],
    environment: "node",
    testTimeout: 60_000,
  },
});
