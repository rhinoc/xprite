// Type-checks every TypeScript project with tsgo (TypeScript 7 native), in parallel and incrementally.
//
// Workspace packages are checked from source. Each project gets a generated tsconfig in
// node_modules/.cache/xprite-types that extends the real one, maps @xprite/* to package sources
// through `paths`, and lists the project's own `$/`-style alias first. TypeScript `paths` apply to a
// whole program, but a `$/` import should resolve inside the importing package's scope
// (infra/package-import-scopes.json). The scope guard below therefore checks that, for every
// scoped import, the generated paths resolve to the same file as the package-scoped resolution,
// and fails if they differ.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tsgo = path.join(rootDir, "node_modules/.bin/tsgo");

const scopes = JSON.parse(
  fs.readFileSync(path.join(rootDir, "infra/package-import-scopes.json"), "utf8"),
).map(({ directory, source, aliases }) => ({
  directory: path.join(rootDir, directory),
  source: path.join(rootDir, directory, source),
  aliases: Object.entries(aliases).map(([prefix, target]) => [
    prefix,
    path.resolve(rootDir, directory, target),
  ]),
}));

// Workspace package entry points, resolved to source (longest prefix wins, as before).
const packageAliases = {
  "@xprite/ui/pattern-data": "packages/ui/assets/patterns/macintosh/catalog.json",
  "@xprite/site-shell/browser": "packages/site-shell/src/adapters/browser.ts",
  "@xprite/site-shell/language-preference": "packages/site-shell/src/language-preference.ts",
  "@xprite/site-shell/startup": "packages/site-shell/src/startup.ts",
  "@xprite/site-shell/telemetry/browser": "packages/site-shell/src/telemetry/posthog.ts",
  "@xprite/site-shell/telemetry": "packages/site-shell/src/managers/ports/telemetry.ts",
  "@xprite/growth-content/features": "apps/growth/content/features/index.ts",
  "@xprite/growth-content/help": "apps/growth/content/help/index.ts",
  "@xprite/growth-content/tools": "apps/growth/content/tools/index.ts",
  "@xprite/growth-content/navigation": "apps/growth/content/site/navigation.ts",
  "@xprite/growth-content/language": "apps/growth/content/site/language.ts",
  "@xprite/growth-content/pages": "apps/growth/content/site/pages.ts",
  "@xprite/bedrock/browser/*": "packages/bedrock/browser/*",
  "@xprite/bedrock/common/*": "packages/bedrock/common/*",
  "@xprite/editor-core/*": "packages/editor-core/src/*",
  "@xprite/editor-core": "packages/editor-core/src/index.ts",
  "@xprite/editor-ui/*": "packages/editor-ui/src/*",
  "@xprite/editor-ui": "packages/editor-ui/src/index.ts",
  "@xprite/editor-app/*": "apps/editor/src/*",
  "@xprite/tools-app/pixelation": "apps/tools/src/pixelation-engine.ts",
  "@xprite/ui/*": "packages/ui/src/*",
  "@xprite/ui": "packages/ui/src/index.ts",
  "@xprite/site-shell/*": "packages/site-shell/src/*",
  "@xprite/site-shell": "packages/site-shell/src/index.ts",
  "@xprite/growth-content/*": "apps/growth/content/*",
};

const projects = [
  "apps/editor/tsconfig.json",
  "apps/editor/tsconfig.node.json",
  "apps/components/tsconfig.json",
  "apps/growth/tsconfig.json",
  "apps/tools/tsconfig.json",
  "apps/xhs-minitools/tsconfig.json",
  "packages/bedrock/tsconfig.common.json",
  "packages/bedrock/tsconfig.browser.json",
  "packages/editor-core/tsconfig.json",
  "packages/ui/tsconfig.json",
  "services/share/tsconfig.json",
  "services/share/tsconfig.tests.json",
  "apps/wechat/tsconfig.check.json",
];

const stripJson = (text) =>
  JSON.parse(
    text
      .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, c) => (c ? "" : m))
      .replace(/,(\s*[}\]])/g, "$1"),
  );

// Original `paths` of a config, made absolute (paths resolve against the config that declares them).
function originalPaths(file) {
  const config = stripJson(fs.readFileSync(file, "utf8"));
  const own = config.compilerOptions?.paths;
  if (own) {
    const base = path.dirname(file);
    return Object.fromEntries(
      Object.entries(own).map(([key, targets]) => [key, targets.map((t) => path.resolve(base, t))]),
    );
  }
  return config.extends ? originalPaths(path.resolve(path.dirname(file), config.extends)) : {};
}

const scopeFor = (file) =>
  scopes.find(({ source, directory }) => isWithin(source, file) || isWithin(directory, file));
function isWithin(directory, file) {
  const relative = path.relative(directory, file);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

// Order in which other packages' scoped targets are tried. editor-core comes before ui because
// both have a `canvas` module and editor-core files reach ui only through @xprite/ui.
const unionOrder = [
  ...["packages/editor-core", "packages/editor-ui", "packages/bedrock", "packages/ui"].map(
    (directory) => scopes.find((scope) => scope.directory === path.join(rootDir, directory)),
  ),
  ...scopes,
].filter((scope, index, all) => scope && all.indexOf(scope) === index);

// A package entry that only re-exports scoped modules (`export * from "$/timeline"`) cannot share
// one program-wide `paths` table with a sibling package that has a module of the same name. Such
// entries are replaced by a generated shim that re-exports the same modules by absolute path. The
// entry itself is still type-checked by its own package project.
const shimDir = path.join(rootDir, "node_modules/.cache/xprite-types/shims");
const shims = new Map();
function reexportShim(target) {
  if (target.includes("*") || !/\.tsx?$/.test(target) || !fs.existsSync(target)) return target;
  if (shims.has(target)) return shims.get(target);
  const lines = fs
    .readFileSync(target, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//"));
  const scope = scopeFor(target);
  const reexports = lines.map((line) => /^export \* from "(\$[\w-]*\/[^"]+)";$/.exec(line)?.[1]);
  let result = target;
  if (scope && reexports.length > 0 && reexports.every(Boolean)) {
    const body = reexports.map((specifier) => {
      const alias = scope.aliases.find(([prefix]) => specifier.startsWith(prefix));
      const resolved =
        alias && firstExisting([path.join(alias[1], specifier.slice(alias[0].length))]);
      if (!resolved) throw new Error(`${target}: cannot resolve ${specifier}`);
      return `export * from ${JSON.stringify(resolved.replace(/\.tsx?$/, ""))};`;
    });
    fs.mkdirSync(shimDir, { recursive: true });
    result = path.join(shimDir, `${path.relative(rootDir, target).replaceAll(/[\\/]/g, "_")}`);
    fs.writeFileSync(result, `${body.join("\n")}\n`);
  }
  shims.set(target, result);
  return result;
}

function projectPaths(projectFile) {
  const own = scopeFor(projectFile);
  const paths = originalPaths(projectFile);
  for (const [key, target] of Object.entries(packageAliases))
    paths[key] = [reexportShim(path.join(rootDir, target))];
  // Scoped aliases: the project's own target first, then every package's target for that prefix,
  // so files pulled in from other packages still resolve. The scope guard proves the result.
  const prefixes = new Set(scopes.flatMap(({ aliases }) => aliases.map(([prefix]) => prefix)));
  for (const prefix of prefixes) {
    const key = `${prefix}*`;
    const ownTarget = own?.aliases.find(([candidate]) => candidate === prefix)?.[1];
    const targets = [
      ...(ownTarget ? [`${ownTarget}/*`] : []),
      ...unionOrder.flatMap(({ aliases }) =>
        aliases.filter(([candidate]) => candidate === prefix).map(([, target]) => `${target}/*`),
      ),
      ...(paths[key] ?? []),
    ];
    paths[key] = [...new Set(targets)];
  }
  return paths;
}

function writeProjectConfig(projectFile, index) {
  // Generated next to the project so `types` and node_modules lookups start from the project.
  const name = `${index}-${path.basename(projectFile)}`;
  const directory = path.join(path.dirname(projectFile), "node_modules/.cache/xprite-types");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, name);
  const config = {
    extends: projectFile,
    compilerOptions: {
      composite: false,
      incremental: true,
      noEmit: true,
      declaration: false,
      declarationMap: false,
      emitDeclarationOnly: false,
      declarationDir: null,
      tsBuildInfoFile: path.join(directory, `${name}.tsbuildinfo`),
      rootDir,
      paths: projectPaths(projectFile),
    },
    references: [],
  };
  // `include`/`files` resolve against the config that declares them, so the inherited values stay correct.
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  return file;
}

// ---- scope guard -----------------------------------------------------------
const candidates = (base) => [
  base,
  ...[".ts", ".tsx", ".d.ts", ".js", ".mjs", ".json"].map((ext) => base + ext),
  ...["index.ts", "index.tsx", "index.d.ts", "index.js"].map((name) => path.join(base, name)),
  ...(base.endsWith(".js") ? [base.slice(0, -3) + ".ts", base.slice(0, -3) + ".tsx"] : []),
];
const isFile = (file) => fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
const firstExisting = (bases) => {
  for (const base of bases)
    for (const candidate of candidates(base)) if (isFile(candidate)) return candidate;
  return undefined;
};
const sourceFile = /\.(?:[cm]?[jt]sx?)$/;
const specifierPattern =
  /(?:from\s*|import\s*\(\s*|import\s+|require\s*\(\s*)["'](\$[\w-]*\/[^"']*)["']/g;

function scopeGuard({ project, paths, files }) {
  const failures = [];
  for (const file of files) {
    const scope = scopeFor(file);
    if (!scope || !sourceFile.test(file) || file.endsWith(".d.ts")) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const [, specifier] of text.matchAll(specifierPattern)) {
      const alias = scope.aliases.find(([prefix]) => specifier.startsWith(prefix));
      if (!alias) continue;
      const rest = specifier.slice(alias[0].length);
      const expected = firstExisting([path.join(alias[1], rest)]);
      const targets = paths[`${alias[0]}*`] ?? [];
      const actual = firstExisting(targets.map((entry) => entry.replace("*", rest)));
      if (actual !== expected)
        failures.push(
          `${path.relative(rootDir, file)}: "${specifier}" resolves to ${
            actual ? path.relative(rootDir, actual) : "nothing"
          } in ${project}, expected ${expected ? path.relative(rootDir, expected) : "nothing"}`,
        );
    }
  }
  return failures;
}

const listFiles = ({ config }) =>
  new Promise((resolve) => {
    const child = spawn(tsgo, ["-p", config, "--listFilesOnly"], { cwd: rootDir });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.on("close", () =>
      resolve(
        output
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line && !line.includes(`${path.sep}node_modules${path.sep}`)),
      ),
    );
  });

// ---- run -------------------------------------------------------------------
const generated = projects.map((project, index) => ({
  project,
  config: writeProjectConfig(path.join(rootDir, project), index),
  paths: projectPaths(path.join(rootDir, project)),
}));

const run = ({ project, config }) =>
  new Promise((resolve) => {
    const child = spawn(tsgo, ["-p", config, "--pretty", "false"], { cwd: rootDir });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (error) => resolve({ project, code: 1, output: error.message }));
    child.on("close", (code) => resolve({ project, code, output }));
  });

const limit = Math.max(
  2,
  Math.min(projects.length, os.availableParallelism?.() ?? os.cpus().length),
);
const queue = [...generated];
const results = [];
await Promise.all(
  Array.from({ length: limit }, async () => {
    while (queue.length > 0) results.push(await run(queue.shift()));
  }),
);

const failures = [];
const fileLists = await Promise.all(generated.map(listFiles));
generated.forEach((entry, index) =>
  failures.push(...scopeGuard({ ...entry, files: fileLists[index] })),
);
const failed = results.filter(({ code }) => code !== 0);
for (const { project, output } of failed) console.error(`${project}\n${output.trim()}\n`);
if (failures.length > 0) {
  console.error("Scoped alias resolution differs between packages:");
  for (const failure of new Set(failures)) console.error(`  - ${failure}`);
}
if (failed.length > 0 || failures.length > 0) process.exitCode = 1;
else console.log(`Type checks passed for ${projects.length} TypeScript projects.`);
