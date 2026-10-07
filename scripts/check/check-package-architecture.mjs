import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dependencyCruiserCli = path.join(
  repositoryRoot,
  "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs",
);
const scopes = [
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
];

for (const scope of scopes) {
  process.stdout.write(`Checking ${scope.name} package architecture...\n`);
  const result = spawnSync(
    process.execPath,
    [
      dependencyCruiserCli,
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
      env: {
        ...process.env,
        XPRITE_DEPENDENCY_CRUISER_TSCONFIG: scope.tsConfig,
      },
      stdio: "inherit",
    },
  );

  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
    process.exitCode = 1;
    break;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
