const { resolve } = require("node:path");

const tsConfigFileName = process.env.XPRITE_DEPENDENCY_CRUISER_TSCONFIG
  ? resolve(__dirname, "..", process.env.XPRITE_DEPENDENCY_CRUISER_TSCONFIG)
  : resolve(__dirname, "tsconfig.dependency-cruiser.json");

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "packages-do-not-import-apps",
      comment: "Application code is at the top of the dependency graph.",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "bedrock-does-not-depend-on-higher-layers",
      comment: "Bedrock is the lowest package layer.",
      severity: "error",
      from: { path: "^packages/bedrock/" },
      to: { path: "^packages/(editor-core|ui)/" },
    },
    {
      name: "bedrock-common-does-not-depend-on-browser",
      comment: "The common Bedrock layer must stay platform independent.",
      severity: "error",
      from: { path: "^packages/bedrock/common/" },
      to: { path: "^packages/bedrock/browser/" },
    },
    {
      name: "editor-core-does-not-depend-on-ui-or-browser",
      comment: "Editor core can use Bedrock common, but not browser adapters or UI.",
      severity: "error",
      from: { path: "^packages/editor-core/src/" },
      to: { path: "^packages/(ui|bedrock/browser)/" },
    },
    {
      name: "ui-does-not-depend-on-editor-core",
      comment: "Reusable UI primitives must not depend on editor business logic.",
      severity: "error",
      from: { path: "^packages/ui/src/" },
      to: { path: "^packages/editor-core/" },
    },
    {
      name: "editor-components-use-manager-apis",
      comment: "Business components consume manager APIs and UI, not core or platform adapters.",
      severity: "error",
      from: { path: "^apps/editor/src/components/" },
      to: { path: "^apps/editor/src/(adapters|services)/|^packages/(editor-core|bedrock)/" },
    },
    {
      name: "editor-components-do-not-import-state-stores",
      comment: "Components read shared state through manager APIs; managers own Zustand stores.",
      severity: "error",
      from: { path: "^apps/editor/src/components/" },
      to: {
        path: [
          "^node_modules/(zustand|jotai|redux|@reduxjs/toolkit|mobx|valtio|recoil)(/|$)",
          "^node_modules/\\.pnpm/[^/]+/node_modules/(zustand|jotai|redux|@reduxjs/toolkit|mobx|valtio|recoil)(/|$)",
        ],
      },
    },
    {
      name: "editor-managers-do-not-import-ui-or-components",
      comment:
        "Managers own app workflows and remain independent from view components and UI primitives.",
      severity: "error",
      from: { path: "^apps/editor/src/managers/" },
      to: { path: "^apps/editor/src/components/|^apps/editor/src/adapters/|^packages/ui/" },
    },
    {
      name: "editor-adapters-do-not-import-components",
      comment: "Platform adapters implement ports and never depend on presentation components.",
      severity: "error",
      from: { path: "^apps/editor/src/adapters/" },
      to: { path: "^apps/editor/src/components/" },
    },
    {
      name: "editor-adapters-do-not-import-manager-implementations",
      comment: "Adapters depend on explicit contracts in managers/ports, not manager behavior.",
      severity: "error",
      from: { path: "^apps/editor/src/adapters/" },
      to: {
        path: "^apps/editor/src/managers/",
        pathNot: "^apps/editor/src/managers/ports/",
      },
    },
    {
      name: "editor-manager-port-contracts-do-not-import-implementations",
      comment: "Port declarations stay independent from manager implementations.",
      severity: "error",
      from: { path: "^apps/editor/src/managers/ports/" },
      to: {
        path: "^apps/editor/src/managers/",
        pathNot: "^apps/editor/src/managers/ports/",
      },
    },
    {
      name: "editor-app-imports-adapters-only-from-composition-root",
      comment: "App.tsx is the composition root that connects concrete adapters to managers.",
      severity: "error",
      from: {
        path: "^apps/editor/src/",
        pathNot: ["^apps/editor/src/App\\.tsx$", "^apps/editor/src/adapters/"],
      },
      to: { path: "^apps/editor/src/adapters/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
    },
    webpackConfig: { fileName: resolve(__dirname, "dependency-cruiser.webpack.cjs") },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: tsConfigFileName },
  },
};
