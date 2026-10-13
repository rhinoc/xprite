import { defineConfig } from "vitest/config";

import { packageLocalAliases } from "./package-local-aliases";

export default defineConfig({
  plugins: [packageLocalAliases()],
  test: {
    include: [
      "apps/**/*.test.ts",
      "packages/**/*.test.ts",
      "services/**/*.test.ts",
      "infra/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.tmp/**"],
    environment: "node",
    // Per-file isolation stays on: several modules cache browser feature detection at import, so
    // sharing a module graph across files makes results depend on file order.
    pool: "forks",
    testTimeout: 60_000,
  },
});
