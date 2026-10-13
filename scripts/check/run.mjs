// Runs repository checks in parallel and reports every failure at the end.
//
//   node scripts/check/run.mjs [group] [--only name,name] [--skip name,name] [--list]
//
// Groups: check (default), architecture, stale-css, site-build, site-output. A task's output is buffered and
// printed as one block when it finishes, so parallel logs never interleave. Tasks in a later phase
// start only after every earlier phase has finished: the site build regenerates packages/ui theme
// sources, which the static checks read.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const isWindows = process.platform === "win32";
const bin = (name) => path.join(rootDir, "node_modules/.bin", isWindows ? `${name}.cmd` : name);
const node = (...args) => [process.execPath, ...args];
const nodeTs = (...args) =>
  node("--experimental-transform-types", "--no-warnings=ExperimentalWarning", ...args);

const sourceGlobs = "js,jsx,ts,tsx,mjs,cjs,mts,cts";
const dataGlobs = `${sourceGlobs},css,scss,html,json,jsonc`;
export const formatTargets = [
  `apps/**/*.{${dataGlobs}}`,
  `services/**/*.{${dataGlobs}}`,
  `packages/**/*.{${dataGlobs}}`,
  `scripts/**/*.{${sourceGlobs}}`,
  `infra/**/*.{${dataGlobs}}`,
  `*.{${dataGlobs}}`,
  "!.tmp/**/*",
  "!apps/editor/src/managers/files/policies/aseprite-widget-geometry/*.json",
];

const groups = {
  architecture: {
    "package-imports": node("scripts/check/check-package-import-policy.mjs"),
    "package-architecture": node("scripts/check/check-package-architecture.mjs"),
    "dom-geometry": node("scripts/check/check-dom-geometry.mjs"),
    "ui-editor-usage": node("scripts/check/check-ui-editor-usage.mjs"),
    "ui-control-placement": node("scripts/check/check-ui-control-placement.mjs"),
    "global-css": node("scripts/check/check-global-css.mjs"),
    "editor-core-graph": node("scripts/check/check-editor-core-graph.mjs"),
  },
  "stale-css": Object.fromEntries(
    ["apps/editor", "apps/components", "apps/growth", "apps/tools", "packages/ui"].map((dir) => [
      `unused-css:${dir}`,
      [bin("check-unused-css"), `${dir}/src`],
    ]),
  ),
  "site-build": {
    // One growth + tools build, then every check that reads its output.
    "site-build": [
      node("scripts/check/check-growth-ssr.mjs"),
      nodeTs("scripts/check/check-page-metadata.mjs", "--no-build"),
      nodeTs("scripts/check/check-asset-versions.mjs", "apps/growth/dist"),
      nodeTs("scripts/check/check-asset-versions.mjs", "apps/tools/dist"),
    ],
  },
};
// The same output checks against an existing `pnpm run build:site` (pre-push builds once).
groups["site-output"] = {
  "site-output": [
    node("scripts/check/check-growth-ssr.mjs", "--prebuilt"),
    ...groups["site-build"]["site-build"].slice(1),
  ],
};
groups.check = {
  "public-docs": node("scripts/check/check-public-docs.mjs"),
  "components-generated": node("scripts/generate-components.mjs", "--check"),
  format: [bin("oxfmt"), "--config", "infra/oxfmt.json", "--check", ...formatTargets],
  lint: [bin("oxlint"), "--config", "infra/oxlint.json"],
  i18n: node("scripts/check/check-i18n-coverage.mjs"),
  duplicates: [
    bin("jscpd"),
    "apps",
    "packages",
    "services",
    "scripts",
    "infra",
    "--format",
    "typescript,tsx,javascript,jsx,css",
    "--ignore",
    "**/generated-ui-components.ts,**/base/theme/generated/themes/*.ts",
    "--min-tokens",
    "50",
    "--threshold",
    "3",
    "--reporters",
    "threshold",
    "--no-colors",
    "--no-tips",
  ],
  knip: [
    bin("knip"),
    "--config",
    "infra/knip.json",
    "--reporter",
    "compact",
    "--no-progress",
    "--cache",
  ],
  types: node("scripts/check/check-types.mjs"),
  ...groups["stale-css"],
  ...groups.architecture,
  ...Object.fromEntries(
    Object.entries(groups["site-build"]).map(([name, steps]) => [name, { phase: 1, steps }]),
  ),
};

function normalize(spec) {
  if (Array.isArray(spec) && Array.isArray(spec[0])) return { phase: 0, steps: spec };
  if (Array.isArray(spec)) return { phase: 0, steps: [spec] };
  return { phase: spec.phase ?? 0, steps: spec.steps };
}

function runStep([command, ...args]) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "0" },
      shell: isWindows && command.endsWith(".cmd"),
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (error) => resolve({ code: 1, output: output + error.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function runTask(name, { steps }) {
  const started = performance.now();
  let output = "";
  let code = 0;
  for (const step of steps) {
    const result = await runStep(step);
    output += result.output;
    code = result.code;
    if (code !== 0) break;
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const status = code === 0 ? "ok  " : "FAIL";
  process.stdout.write(`[${status}] ${name} (${seconds}s)\n`);
  if (code !== 0 && output.trim()) process.stdout.write(`${output.trimEnd()}\n\n`);
  return { name, code, seconds };
}

const argv = process.argv.slice(2);
const groupName = argv.find((arg) => !arg.startsWith("--")) ?? "check";
const group = groups[groupName];
if (!group) {
  console.error(`Unknown check group "${groupName}". Groups: ${Object.keys(groups).join(", ")}`);
  process.exit(2);
}
let names = Object.keys(group);
if (argv.includes("--list")) {
  console.log(names.join("\n"));
  process.exit(0);
}
const skipIndex = argv.indexOf("--skip");
if (skipIndex !== -1) {
  const skipped = (argv[skipIndex + 1] ?? "").split(",").filter(Boolean);
  const unknown = skipped.filter((name) => !names.includes(name));
  if (unknown.length > 0) {
    console.error(`Unknown task(s) in ${groupName}: ${unknown.join(", ")}`);
    process.exit(2);
  }
  names = names.filter((name) => !skipped.includes(name));
}
const onlyIndex = argv.indexOf("--only");
if (onlyIndex !== -1) {
  const wanted = (argv[onlyIndex + 1] ?? "").split(",").filter(Boolean);
  const unknown = wanted.filter((name) => !names.includes(name));
  if (unknown.length > 0) {
    console.error(`Unknown task(s) in ${groupName}: ${unknown.join(", ")}`);
    process.exit(2);
  }
  names = wanted;
}

const limit =
  Number(process.env.XPRITE_CHECK_JOBS) || os.availableParallelism?.() || os.cpus().length;
const started = performance.now();
const results = [];
const tasks = names.map((name) => [name, normalize(group[name])]);
for (const phase of [...new Set(tasks.map(([, task]) => task.phase))].sort()) {
  const queue = tasks.filter(([, task]) => task.phase === phase);
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length > 0) results.push(await runTask(...queue.shift()));
    }),
  );
}

const failed = results.filter(({ code }) => code !== 0);
const total = ((performance.now() - started) / 1000).toFixed(1);
if (failed.length > 0) {
  console.error(
    `\n${groupName}: ${failed.length} of ${results.length} failed in ${total}s: ${failed.map(({ name }) => name).join(", ")}`,
  );
  process.exitCode = 1;
} else {
  console.log(`\n${groupName}: all ${results.length} passed in ${total}s.`);
}
