import path from "node:path";
import { fileURLToPath } from "node:url";

import { fanOut } from "../base/fan-out.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dependencyCruiserCli = path.join(
  repositoryRoot,
  "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs",
);
const scopes = [
  {
    name: "growth-app",
    tsConfig: "apps/growth/tsconfig.json",
    sources: ["apps/growth/src", "apps/growth/content", "apps/growth/build"],
  },
  {
    name: "editor-ui",
    tsConfig: "packages/editor-ui/tsconfig.json",
    sources: ["packages/editor-ui/src"],
  },
  {
    name: "share-service",
    tsConfig: "services/share/tsconfig.json",
    sources: ["services/share/src"],
  },
  {
    name: "bedrock",
    tsConfig: "packages/bedrock/tsconfig.browser.json",
    sources: ["packages/bedrock/browser", "packages/bedrock/common"],
  },
  {
    name: "editor-core",
    tsConfig: "packages/editor-core/tsconfig.json",
    sources: ["packages/editor-core/src"],
  },
  {
    name: "ui",
    tsConfig: "packages/ui/tsconfig.json",
    sources: ["packages/ui/src"],
  },
  {
    name: "editor-app",
    tsConfig: "apps/editor/tsconfig.json",
    sources: ["apps/editor/src"],
  },
  {
    name: "tools-app",
    tsConfig: "apps/tools/tsconfig.json",
    sources: ["apps/tools/src"],
  },
  {
    name: "xhs-minitool",
    tsConfig: "apps/xhs-minitool/tsconfig.json",
    sources: ["apps/xhs-minitool/src"],
  },
];

// Each scope is an independent dependency-cruiser run; they run in parallel child processes and
// print one block per scope, in order.
const results = await fanOut(
  dependencyCruiserCli,
  scopes,
  (scope) => [
    "--config",
    "infra/dependency-cruiser.cjs",
    "--output-type",
    "err-long",
    "--exclude",
    "\\.test\\.(ts|tsx)$",
    ...scope.sources,
  ],
  {
    cwd: repositoryRoot,
    env: (scope) => ({ XPRITE_DEPENDENCY_CRUISER_TSCONFIG: scope.tsConfig }),
  },
);
for (const { item, code, stdout, stderr } of results) {
  process.stdout.write(`Checking ${item.name} package architecture...\n${stdout}`);
  process.stderr.write(stderr);
  if (code !== 0) process.exitCode = code;
}
