import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript-compiler-api";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const aliasScopes = JSON.parse(
  fs.readFileSync(path.join(rootDir, "infra/package-import-scopes.json"), "utf8"),
).map(({ directory, source, aliases }) => ({
  source: path.join(rootDir, directory, source),
  aliases: Object.entries(aliases)
    .sort(([left], [right]) => right.length - left.length)
    .map(([prefix, target]) => [prefix, path.resolve(rootDir, directory, target)]),
}));
const projectConfigs = [
  "apps/editor/tsconfig.json",
  "apps/editor/tsconfig.node.json",
  "apps/components/tsconfig.json",
  "apps/growth/tsconfig.json",
  "apps/tools/tsconfig.json",
  "packages/bedrock/tsconfig.common.json",
  "packages/bedrock/tsconfig.browser.json",
  "packages/editor-core/tsconfig.json",
  "packages/ui/tsconfig.json",
  "services/share/tsconfig.json",
  "services/share/tsconfig.tests.json",
];
const packageAliases = [
  [
    "@xprite/ui/pattern-data",
    path.join(rootDir, "packages/ui/assets/patterns/macintosh/catalog.json"),
  ],
  ["@xprite/site-shell/browser", path.join(rootDir, "packages/site-shell/src/adapters/browser.ts")],
  [
    "@xprite/site-shell/language-preference",
    path.join(rootDir, "packages/site-shell/src/language-preference.ts"),
  ],
  ["@xprite/site-shell/startup", path.join(rootDir, "packages/site-shell/src/startup.ts")],
  [
    "@xprite/site-shell/telemetry/browser",
    path.join(rootDir, "packages/site-shell/src/telemetry/posthog.ts"),
  ],
  [
    "@xprite/site-shell/telemetry",
    path.join(rootDir, "packages/site-shell/src/managers/ports/telemetry.ts"),
  ],
  ["@xprite/growth-content/features", path.join(rootDir, "apps/growth/content/features/index.ts")],
  ["@xprite/growth-content/help", path.join(rootDir, "apps/growth/content/help/index.ts")],
  ["@xprite/growth-content/tools", path.join(rootDir, "apps/growth/content/tools/index.ts")],
  [
    "@xprite/growth-content/navigation",
    path.join(rootDir, "apps/growth/content/site/navigation.ts"),
  ],
  ["@xprite/growth-content/language", path.join(rootDir, "apps/growth/content/site/language.ts")],
  ["@xprite/growth-content/pages", path.join(rootDir, "apps/growth/content/site/pages.ts")],
  ["@xprite/bedrock/browser/", path.join(rootDir, "packages/bedrock/browser")],
  ["@xprite/bedrock/common/", path.join(rootDir, "packages/bedrock/common")],
  ["@xprite/editor-core/", path.join(rootDir, "packages/editor-core/src")],
  ["@xprite/editor-core", path.join(rootDir, "packages/editor-core/src/index.ts")],
  ["@xprite/editor-ui/", path.join(rootDir, "packages/editor-ui/src")],
  ["@xprite/editor-ui", path.join(rootDir, "packages/editor-ui/src/index.ts")],
  ["@xprite/editor-app/", path.join(rootDir, "apps/editor/src")],
  ["@xprite/ui/", path.join(rootDir, "packages/ui/src")],
  ["@xprite/ui", path.join(rootDir, "packages/ui/src/index.ts")],
  ["@xprite/site-shell/", path.join(rootDir, "packages/site-shell/src")],
  ["@xprite/site-shell", path.join(rootDir, "packages/site-shell/src/index.ts")],
  ["@xprite/growth-content/", path.join(rootDir, "apps/growth/content")],
].sort(([left], [right]) => right.length - left.length);

function isWithin(directory, filename) {
  const relative = path.relative(directory, path.resolve(filename));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function resolveModule(name, importer, options) {
  const packageAlias = packageAliases.find(
    ([prefix]) => name === prefix || name.startsWith(prefix),
  );
  if (packageAlias) {
    const [prefix, target] = packageAlias;
    const aliasedPath = prefix.endsWith("/")
      ? path.join(target, name.slice(prefix.length))
      : target;
    return ts.resolveModuleName(aliasedPath, importer, options, ts.sys).resolvedModule;
  }

  const scope = aliasScopes.find(({ source }) => isWithin(source, importer));
  const alias = scope?.aliases.find(([prefix]) => name.startsWith(prefix));
  const target = alias ? path.join(alias[1], name.slice(alias[0].length)) : name;
  return ts.resolveModuleName(target, importer, options, ts.sys).resolvedModule;
}

const failures = [];
for (const projectConfig of projectConfigs) {
  console.log(`Type-checking ${projectConfig}`);
  const configPath = path.join(rootDir, projectConfig);
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) {
    failures.push(ts.flattenDiagnosticMessageText(read.error.messageText, "\n"));
    continue;
  }

  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    path.dirname(configPath),
    {},
    configPath,
  );
  const options = {
    ...parsed.options,
    composite: false,
    incremental: false,
    noEmit: true,
  };
  delete options.rootDir;
  delete options.declarationDir;
  delete options.tsBuildInfoFile;

  const host = ts.createCompilerHost(options);
  host.resolveModuleNames = (names, importer) =>
    names.map((name) => resolveModule(name, importer, options));
  const program = ts.createProgram({ rootNames: parsed.fileNames, options, host });
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
  if (diagnostics.length > 0) {
    failures.push(
      `${projectConfig}\n${ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (filename) => filename,
        getCurrentDirectory: () => rootDir,
        getNewLine: () => "\n",
      })}`,
    );
  }
}

console.log("Type-checking apps/wechat/tsconfig.check.json");
const wechatCheck = spawnSync(
  "pnpm",
  ["exec", "tsgo", "-p", "apps/wechat/tsconfig.check.json", "--noEmit"],
  { cwd: rootDir, encoding: "utf8" },
);
if (wechatCheck.stdout) process.stdout.write(wechatCheck.stdout);
if (wechatCheck.stderr) process.stderr.write(wechatCheck.stderr);
if (wechatCheck.error) failures.push(wechatCheck.error.message);
if (wechatCheck.status !== 0)
  failures.push(`apps/wechat/tsconfig.check.json exited with code ${wechatCheck.status}`);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Type checks passed for ${projectConfigs.length + 1} TypeScript projects.`);
}
